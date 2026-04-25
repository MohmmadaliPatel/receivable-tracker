import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GraphMailService } from '@/lib/graph-mail-service';
import { getCustomerGroups, getLineItemsForGroup, sumLineItemsTotalBalance } from '@/lib/aging-service';
import { getEmailForCustomer } from '@/lib/customer-email-directory';
import { splitStoredEmails } from '@/lib/email-parser';
import { getCurrentUser } from '@/lib/simple-auth';
import {
  collectAgingSendAttachments,
  mergeAgingSendAttachmentsWithLocalPdfs,
  type ResolvedMailAttachment,
} from '@/lib/aging-import-attachments';
import { localPdfsFromFormData, stripHtmlToPlain } from '@/lib/aging-bulk-form';
import {
  generateDefaultEmailBody,
  generateEmailSubject,
  EmailTemplateData,
  mapLineItemsToInvoiceRows,
} from '@/lib/aging-templates';

type BulkBody = {
  importId?: string;
  grouping?: 'name' | 'code';
  onlyNeverSent?: boolean;
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
    let body: BulkBody;
    let localByDocNo: Map<string, ResolvedMailAttachment> | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const raw = form.get('payload');
      if (typeof raw !== 'string' || !raw.trim()) {
        return NextResponse.json({ error: 'Missing field: payload' }, { status: 400 });
      }
      try {
        body = JSON.parse(raw) as BulkBody;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON in payload' }, { status: 400 });
      }
      localByDocNo = await localPdfsFromFormData(form);
    } else {
      body = (await request.json()) as BulkBody;
    }

    const { importId, grouping, onlyNeverSent = true, groupKeys, companyCode: companyCodeBody } = body;

    if (!importId) {
      return NextResponse.json({ error: 'Missing importId' }, { status: 400 });
    }

    const g = (grouping === 'name' ? 'name' : 'code') as 'name' | 'code';
    const co =
      companyCodeBody && String(companyCodeBody).trim()
        ? String(companyCodeBody).trim()
        : undefined;

    const emailConfig = await prisma.emailConfig.findFirst({
      where: { userId: user.id, isActive: true },
    });

    if (!emailConfig) {
      return NextResponse.json(
        { error: 'No active email configuration found.' },
        { status: 400 }
      );
    }

    const groups = await getCustomerGroups(user.id, importId, g, co);

    let targets = onlyNeverSent
      ? groups.filter((gr) => gr.totalEmailsCount === 0)
      : groups;

    if (groupKeys !== undefined) {
      if (groupKeys.length === 0) {
        return NextResponse.json({ sent: 0, skipped: 0, errors: [] as string[] });
      }
      const allow = new Set(groupKeys);
      targets = targets.filter((gr) => allow.has(gr.groupKey));
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

    for (const group of targets) {
      let logTo = '';
      let logSubject: string | null = null;
      let logHtml: string | null = null;
      try {
        const lineItems = await getLineItemsForGroup(user.id, importId, group.lineItemIds);
        if (lineItems.length === 0) {
          results.skipped++;
          continue;
        }
        if (sumLineItemsTotalBalance(lineItems) <= 0) {
          results.skipped++;
          results.errors.push(`Skipped ${group.groupKey}: non-positive total balance.`);
          continue;
        }

        const firstItem = lineItems[0];
        const directoryEmail = await getEmailForCustomer(
          user.id,
          group.customerCode || firstItem.customerCode,
          group.customerName || firstItem.customerName,
          g === 'code' ? 'code' : 'name'
        );
        const dirTo = directoryEmail?.emailTo?.trim();
        const recipientEmail = dirTo || firstItem.emailTo;
        const directoryCc: string | null = dirTo
          ? (directoryEmail?.emailCc?.trim() || null)
          : null;

        if (!recipientEmail) {
          results.skipped++;
          results.errors.push(
            `Skipped ${group.groupKey}: no email for customer.`
          );
          continue;
        }

        const templateData: EmailTemplateData = {
          customerName: group.customerName,
          customerCode: group.customerCode,
          companyName: group.companyName,
          invoices: mapLineItemsToInvoiceRows(lineItems),
          totalAmount: lineItems
            .reduce((sum, item) => {
              const amount = item.totalBalance
                ? parseFloat(item.totalBalance.replace(/,/g, ''))
                : 0;
              return sum + (isNaN(amount) ? 0 : amount);
            }, 0)
            .toString(),
        };

        const subject = generateEmailSubject(templateData);
        const htmlBody = generateDefaultEmailBody(templateData);

        let attachments = await collectAgingSendAttachments(
          user.id,
          firstItem,
          importAttachmentMap
        );
        if (local.size > 0) {
          attachments = mergeAgingSendAttachmentsWithLocalPdfs(attachments, lineItems, local);
        }

        const toAddresses = splitStoredEmails(recipientEmail);
        if (toAddresses.length === 0) {
          results.skipped++;
          results.errors.push(`Skipped ${group.groupKey}: no valid email addresses.`);
          continue;
        }
        const ccAddresses: string[] = [];
        if (directoryCc) ccAddresses.push(...splitStoredEmails(directoryCc));
        if (!dirTo && firstItem.emailCc) {
          ccAddresses.push(...splitStoredEmails(firstItem.emailCc));
        }
        const toSet = new Set(toAddresses);
        const mergedCc = [...new Set(ccAddresses)].filter((e) => !toSet.has(e));

        logTo = toAddresses.join(', ');
        logSubject = subject;
        logHtml = htmlBody;

        const sendResult = await GraphMailService.sendMail(emailConfig, {
          to: toAddresses.length === 1 ? toAddresses[0] : toAddresses,
          subject,
          htmlBody,
          cc: mergedCc.length > 0 ? mergedCc : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        await prisma.email.create({
          data: {
            to: logTo,
            subject: logSubject,
            body: logHtml ? stripHtmlToPlain(logHtml) : null,
            htmlBody: logHtml,
            status: 'sent',
            errorMessage: null,
            emailConfigId: emailConfig.id,
          },
        });

        const sentMessageId = sendResult?.id || '';
        const now = new Date();
        const updates: Promise<unknown>[] = [];

        for (const item of lineItems) {
          if (item.documentNo) {
            const invoiceKey = `${item.companyCode}-${item.documentNo}`;

            const existingChase = await prisma.invoiceChase.findUnique({
              where: {
                userId_invoiceKey: {
                  userId: user.id,
                  invoiceKey,
                },
              },
            });

            let outreachRounds: { importId: string; sentAt: string }[] = [];
            if (existingChase?.outreachRoundsJson) {
              try {
                outreachRounds = JSON.parse(existingChase.outreachRoundsJson);
              } catch {
                outreachRounds = [];
              }
            }

            const existingRound = outreachRounds.find((r) => r.importId === importId);
            if (!existingRound) {
              outreachRounds.push({
                importId,
                sentAt: now.toISOString(),
              });
            }

            updates.push(
              prisma.invoiceChase.update({
                where: {
                  userId_invoiceKey: {
                    userId: user.id,
                    invoiceKey,
                  },
                },
                data: {
                  emailCount: { increment: 1 },
                  sentAt: now,
                  sentMessageId: sentMessageId || existingChase?.sentMessageId,
                  emailTo: toAddresses.join(', '),
                  emailCc: mergedCc.length > 0 ? mergedCc.join(', ') : null,
                  emailConfigId: emailConfig.id,
                  outreachRoundsJson: JSON.stringify(outreachRounds),
                  lastImportId: importId,
                  status: 'outstanding',
                },
              })
            );
          }
        }

        await Promise.all(updates);
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
              },
            });
          } catch (logErr) {
            console.error('[Aging Bulk Send] Failed to log email row:', logErr);
          }
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('[Aging Bulk Send] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process bulk send';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
