import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GraphMailService } from '@/lib/graph-mail-service';
import { getCustomerGroups, getLineItemsForGroup, sumLineItemsTotalBalance } from '@/lib/aging-service';
import { generateFollowupEmailBody, EmailTemplateData, mapLineItemsToInvoiceRows } from '@/lib/aging-templates';
import { getCurrentUser } from '@/lib/simple-auth';
import {
  collectAgingSendAttachments,
  mergeAgingSendAttachmentsWithLocalPdfs,
  type ResolvedMailAttachment,
} from '@/lib/aging-import-attachments';
import { localPdfsFromFormData, stripHtmlToPlain } from '@/lib/aging-bulk-form';
import { parseEmailAddresses } from '@/lib/email-parser';

type FollowupBody = {
  importId?: string;
  grouping?: 'name' | 'code';
  groupKeys?: string[];
  companyCode?: string;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    let body: FollowupBody;
    let localByDocNo: Map<string, ResolvedMailAttachment> | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const raw = form.get('payload');
      if (typeof raw !== 'string' || !raw.trim()) {
        return NextResponse.json({ error: 'Missing field: payload' }, { status: 400 });
      }
      try {
        body = JSON.parse(raw) as FollowupBody;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON in payload' }, { status: 400 });
      }
      localByDocNo = await localPdfsFromFormData(form);
    } else {
      body = (await request.json()) as FollowupBody;
    }

    const { importId, grouping, groupKeys, companyCode: companyCodeBody } = body;

    if (!importId) {
      return NextResponse.json({ error: 'Missing importId parameter' }, { status: 400 });
    }

    // Get email config
    const emailConfig = await prisma.emailConfig.findFirst({
      where: { userId: user.id, isActive: true },
    });

    if (!emailConfig) {
      return NextResponse.json(
        { error: 'No active email configuration found.' },
        { status: 400 }
      );
    }

    const co =
      companyCodeBody && String(companyCodeBody).trim()
        ? String(companyCodeBody).trim()
        : undefined;
    const groups = await getCustomerGroups(
      user.id,
      importId,
      (grouping === 'name' ? 'name' : 'code') as 'name' | 'code',
      co,
    );

    // Find groups that have been sent but have no response
    const groupsToFollowUp: typeof groups = [];

    for (const group of groups) {
      // Check if any invoice in this group needs follow-up
      const lineItems = await getLineItemsForGroup(user.id, importId, group.lineItemIds);
      if (lineItems.length === 0 || sumLineItemsTotalBalance(lineItems) <= 0) {
        continue;
      }

      for (const item of lineItems) {
        if (!item.documentNo) continue;

        const invoiceKey = `${item.companyCode}-${item.documentNo}`;
        const chase = await prisma.invoiceChase.findUnique({
          where: {
            userId_invoiceKey: {
              userId: user.id,
              invoiceKey,
            },
          },
        });

        if (
          chase &&
          chase.lastResponseAt == null &&
          (!!chase.sentMessageId?.trim() ||
            (chase.emailCount ?? 0) > 0 ||
            (chase.followupCount ?? 0) > 0)
        ) {
          groupsToFollowUp.push(group);
          break; // Only add group once
        }
      }
    }

    const results = {
      sent: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const importAttRows = await prisma.agingImportCustomerAttachment.findMany({
      where: { userId: user.id, importId },
    });
    const importAttachmentMap = new Map(
      importAttRows.map((r) => [r.customerCode, { filePath: r.filePath, fileName: r.fileName }])
    );

    const local = localByDocNo ?? new Map<string, ResolvedMailAttachment>();

    let toFollowUp = groupsToFollowUp;
    if (groupKeys !== undefined) {
      if (groupKeys.length === 0) {
        return NextResponse.json({ sent: 0, skipped: 0, errors: [] as string[] });
      }
      const allow = new Set(groupKeys);
      toFollowUp = groupsToFollowUp.filter((gr) => allow.has(gr.groupKey));
    }

    const notInFollowupPool = groups.length - toFollowUp.length;

    // Send follow-ups
    for (const group of toFollowUp) {
      let logTo = '';
      let logSubject: string | null = null;
      let logHtml: string | null = null;
      let followupLineItems: Awaited<ReturnType<typeof getLineItemsForGroup>> = [];
      let followupPrimaryKey: string | null = null;
      try {
        const lineItems = await getLineItemsForGroup(user.id, importId, group.lineItemIds);
        followupLineItems = lineItems;
        if (lineItems.length === 0) continue;
        if (sumLineItemsTotalBalance(lineItems) <= 0) {
          results.skipped++;
          continue;
        }

        const firstItem = lineItems[0];
        /** Prefer any line that has a Graph message id (thread root for reply), not only the first row. */
        let chase: Awaited<ReturnType<typeof prisma.invoiceChase.findUnique>> = null;
        for (const item of lineItems) {
          if (!item.documentNo) continue;
          const ik = `${item.companyCode}-${item.documentNo}`;
          const ch = await prisma.invoiceChase.findUnique({
            where: {
              userId_invoiceKey: {
                userId: user.id,
                invoiceKey: ik,
              },
            },
          });
          if (ch?.sentMessageId?.trim()) {
            chase = ch;
            break;
          }
        }

        if (!chase?.sentMessageId?.trim()) {
          results.skipped++;
          results.errors.push(
            `Skipped ${group.groupKey}: no Graph message id for a threaded reply (use a line that has the initial send, or re-send).`
          );
          continue;
        }

        // Build follow-up content
        const templateData: EmailTemplateData = {
          customerName: group.customerName,
          customerCode: group.customerCode,
          companyName: group.companyName,
          invoices: mapLineItemsToInvoiceRows(lineItems),
          totalAmount: lineItems.reduce((sum, item) => {
            const amount = item.totalBalance ? parseFloat(item.totalBalance.replace(/,/g, '')) : 0;
            return sum + (isNaN(amount) ? 0 : amount);
          }, 0).toString(),
        };

        const followupBody = generateFollowupEmailBody(templateData);
        const logSubjectVal = `Follow-up: ${group.customerName}`.trim();

        let attachments = await collectAgingSendAttachments(
          user.id,
          firstItem,
          importAttachmentMap
        );
        if (local.size > 0) {
          attachments = mergeAgingSendAttachmentsWithLocalPdfs(attachments, lineItems, local);
        }

        // Prefer directory-merged group addresses (same as getCustomerGroups / first send), then chase, then line
        let toList = parseEmailAddresses(group.emailTo);
        if (toList.length === 0) toList = parseEmailAddresses(chase?.emailTo ?? null);
        if (toList.length === 0) toList = parseEmailAddresses(firstItem.emailTo ?? null);
        if (toList.length === 0) {
          results.skipped++;
          results.errors.push(`Skipped follow-up for ${group.groupKey}: no To address.`);
          continue;
        }
        const toArg: string | string[] = toList.length === 1 ? toList[0]! : toList;
        const toSet = new Set(toList);

        let ccList = parseEmailAddresses(group.emailCc);
        if (ccList.length === 0) ccList = parseEmailAddresses(chase?.emailCc ?? null);
        if (ccList.length === 0) ccList = parseEmailAddresses(firstItem.emailCc ?? null);
        const mergedCc = [...new Set(ccList)].filter((e) => !toSet.has(e));

        logTo = toList.join(', ');
        logSubject = logSubjectVal;
        logHtml = followupBody;
        if (firstItem.documentNo) {
          followupPrimaryKey = `${firstItem.companyCode}-${firstItem.documentNo}`;
        }

        // Send threaded reply
        const graphFollowupId = await GraphMailService.replyToMessage(
          emailConfig,
          chase.sentMessageId!,
          {
            to: toArg,
            htmlBody: followupBody,
            cc: mergedCc.length > 0 ? (mergedCc.length === 1 ? mergedCc[0]! : mergedCc) : undefined,
            attachments: attachments.length > 0 ? attachments : undefined,
          },
        );

        const emailRow = await prisma.email.create({
          data: {
            to: logTo,
            subject: logSubject,
            body: logHtml ? stripHtmlToPlain(logHtml) : null,
            htmlBody: logHtml,
            status: 'sent',
            errorMessage: null,
            emailConfigId: emailConfig.id,
            userId: user.id,
            agingInvoiceKey: followupPrimaryKey,
            kind: 'aging_followup',
          },
        });

        // Update follow-up tracking
        const now = new Date();

        for (const item of lineItems) {
          if (!item.documentNo) continue;

          const itemKey = `${item.companyCode}-${item.documentNo}`;

          const existingChase = await prisma.invoiceChase.findUnique({
            where: {
              userId_invoiceKey: {
                userId: user.id,
                invoiceKey: itemKey,
              },
            },
          });

          let followups: {
            sentAt: string;
            subject?: string;
            emailId?: string;
            graphMessageId?: string;
          }[] = [];
          if (existingChase?.followupsJson) {
            try {
              followups = JSON.parse(existingChase.followupsJson);
            } catch {
              followups = [];
            }
          }

          followups.push({
            sentAt: now.toISOString(),
            subject: logSubjectVal,
            emailId: emailRow.id,
            graphMessageId: graphFollowupId,
          });

          await prisma.invoiceChase.update({
            where: {
              userId_invoiceKey: {
                userId: user.id,
                invoiceKey: itemKey,
              },
            },
            data: {
              followupCount: { increment: 1 },
              lastFollowupAt: now,
              followupMessageId: graphFollowupId,
              followupsJson: JSON.stringify(followups),
              lastAgingSendFailedAt: null,
              lastAgingSendError: null,
            },
          });
        }

        results.sent++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Group ${group.groupKey}: ${msg}`);
        if (logTo && logSubject) {
          try {
            await prisma.email.create({
              data: {
                to: logTo,
                subject: logSubject,
                body: logHtml ? stripHtmlToPlain(logHtml) : null,
                htmlBody: logHtml,
                status: 'failed',
                errorMessage: msg,
                emailConfigId: emailConfig.id,
                userId: user.id,
                agingInvoiceKey: followupPrimaryKey,
                kind: 'aging_followup',
              },
            });
            const failTime = new Date();
            for (const item of followupLineItems) {
              if (!item.documentNo) continue;
              const ik = `${item.companyCode}-${item.documentNo}`;
              try {
                await prisma.invoiceChase.update({
                  where: {
                    userId_invoiceKey: { userId: user.id, invoiceKey: ik },
                  },
                  data: {
                    lastAgingSendFailedAt: failTime,
                    lastAgingSendError: msg,
                  },
                });
              } catch {
                // no chase
              }
            }
          } catch (logErr) {
            console.error('[Aging Bulk Followup] Failed to log email row:', logErr);
          }
        }
      }
    }

    return NextResponse.json({ ...results, notInFollowupPool });
  } catch (error) {
    console.error('[Aging Bulk Followup] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process bulk follow-up';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
