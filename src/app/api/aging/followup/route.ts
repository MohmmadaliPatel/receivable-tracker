import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GraphMailService } from '@/lib/graph-mail-service';
import {
  getLineItemsForGroup,
  getThreadRootMessageIdForImport,
  mergeResolvedRootMessageIdIntoChaseData,
} from '@/lib/aging-service';
import {
  generateFollowupEmailBody,
  generateFollowupSubject,
  EmailTemplateData,
  mapLineItemsToInvoiceRows,
} from '@/lib/aging-templates';
import { getCurrentUser } from '@/lib/simple-auth';
import { collectAgingSendAttachments } from '@/lib/aging-import-attachments';
import { stripHtmlToPlain } from '@/lib/aging-bulk-form';
import { isPlausibleEmailAddress, parseEmailAddresses } from '@/lib/email-parser';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { importId, lineItemIds, htmlBody, cc, grouping, customerName, customerCode } = body;

    if (!importId || !lineItemIds || !Array.isArray(lineItemIds) || lineItemIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Get line items
    const lineItems = await getLineItemsForGroup(user.id, importId, lineItemIds);

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'No line items found' }, { status: 404 });
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

    // Get the first line item to find the original sent message
    const firstItem = lineItems[0];
    const invoiceKey = `${firstItem.companyCode}-${firstItem.documentNo}`;
    
    // Get the InvoiceChase record
    const chase = await prisma.invoiceChase.findUnique({
      where: {
        userId_invoiceKey: {
          userId: user.id,
          invoiceKey,
        },
      },
    });

    const threadRootId = getThreadRootMessageIdForImport(chase, importId);
    if (!threadRootId || !chase) {
      return NextResponse.json(
        {
          error:
            'No Microsoft 365 message for this ageing file to reply to. Send the initial chaser for this same report, then try the follow-up again.',
        },
        { status: 400 }
      );
    }

    // Build follow-up content
    let followupBody = htmlBody;
    if (!followupBody) {
      const templateData: EmailTemplateData = {
        customerName: customerName || firstItem.customerName,
        customerCode: customerCode || firstItem.customerCode,
        companyName: firstItem.companyName,
        invoices: mapLineItemsToInvoiceRows(lineItems),
        totalAmount: lineItems.reduce((sum, item) => {
          const amount = item.totalBalance ? parseFloat(item.totalBalance.replace(/,/g, '')) : 0;
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0).toString(),
      };
      followupBody = generateFollowupEmailBody(templateData);
    }

    const importAtts = await prisma.agingImportCustomerAttachment.findMany({
      where: { userId: user.id, importId },
    });
    const importMap = new Map(
      importAtts.map((r) => [r.customerCode, { filePath: r.filePath, fileName: r.fileName }])
    );
    const attachments = await collectAgingSendAttachments(user.id, firstItem, importMap);

    const subjData: EmailTemplateData = {
      customerName: customerName || firstItem.customerName,
      customerCode: customerCode || firstItem.customerCode,
      companyName: firstItem.companyName,
      invoices: mapLineItemsToInvoiceRows(lineItems),
      totalAmount: lineItems
        .reduce((sum, item) => {
          const amount = item.totalBalance ? parseFloat(item.totalBalance.replace(/,/g, '')) : 0;
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0)
        .toString(),
    };
    const followSubject = generateFollowupSubject(subjData);

    const toRaw = parseEmailAddresses(chase.emailTo || firstItem.emailTo).filter(isPlausibleEmailAddress);
    if (toRaw.length === 0) {
      return NextResponse.json(
        { error: 'No valid To address. Fix the email in the directory or the sheet, then try again.' },
        { status: 400 }
      );
    }
    const toForGraph = toRaw.length === 1 ? toRaw[0]! : toRaw;

    const ccForGraph =
      [cc, chase.emailCc].filter(Boolean).join(', ').trim() || undefined;

    const firstWithDoc = lineItems.find((it) => it.documentNo);
    const firstDocKey = firstWithDoc
      ? `${firstWithDoc.companyCode}-${firstWithDoc.documentNo}`
      : null;

    let graphFollowupId: string;
    try {
      const replyResult = await GraphMailService.replyToMessage(
        emailConfig,
        threadRootId,
        {
          to: toForGraph,
          htmlBody: followupBody,
          cc: ccForGraph,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      );
      graphFollowupId = replyResult.replyDraftId;
      if (replyResult.resolvedOriginalId) {
        const m = replyResult.resolvedOriginalId;
        for (const item of lineItems) {
          if (!item.documentNo) continue;
          const itemKey = `${item.companyCode}-${item.documentNo}`;
          const existingCh = await prisma.invoiceChase.findUnique({
            where: {
              userId_invoiceKey: { userId: user.id, invoiceKey: itemKey },
            },
          });
          if (!existingCh) continue;
          const merged = mergeResolvedRootMessageIdIntoChaseData(
            existingCh.outreachRoundsJson,
            importId,
            m,
            existingCh.lastImportId,
          );
          try {
            await prisma.invoiceChase.update({
              where: {
                userId_invoiceKey: { userId: user.id, invoiceKey: itemKey },
              },
              data: {
                outreachRoundsJson: merged.outreachRoundsJson,
                ...(merged.sentMessageId != null ? { sentMessageId: merged.sentMessageId } : {}),
              },
            });
          } catch (mergeErr) {
            console.error('[Aging Followup] failed to store resolved message id:', mergeErr);
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ErrorItemNotFound') || msg.includes('404')) {
        const errText =
          'The original outgoing email is no longer in the mailbox, or it belongs to a different upload. Send a new initial for this ageing file, then follow up again.';
        try {
          await prisma.email.create({
            data: {
              to: toRaw.join(', '),
              subject: followSubject,
              body: followupBody ? stripHtmlToPlain(followupBody) : null,
              htmlBody: followupBody,
              status: 'failed',
              errorMessage: `${errText} (${msg})`,
              emailConfigId: emailConfig.id,
              userId: user.id,
              agingInvoiceKey: firstDocKey,
              kind: 'aging_followup',
              agingImportId: importId,
            },
          });
        } catch (logErr) {
          console.error('[Aging Followup] email log (Graph 404) failed:', logErr);
        }
        return NextResponse.json(
          {
            error: errText,
          },
          { status: 409 }
        );
      }
      throw e;
    }

    let followupLogEmailId: string | null = null;
    try {
      const row = await prisma.email.create({
        data: {
          to: toRaw.join(', '),
          subject: followSubject,
          body: followupBody ? stripHtmlToPlain(followupBody) : null,
          htmlBody: followupBody,
          status: 'sent',
          errorMessage: null,
          emailConfigId: emailConfig.id,
          userId: user.id,
          agingInvoiceKey: firstDocKey,
          kind: 'aging_followup',
          agingImportId: importId,
        },
      });
      followupLogEmailId = row.id;
    } catch (e) {
      console.error('[Aging Followup] email log create (message was still sent):', e);
    }

    // Update InvoiceChase records
    const now = new Date();
    const updates: Promise<unknown>[] = [];

    for (const item of lineItems) {
      if (item.documentNo) {
        const itemKey = `${item.companyCode}-${item.documentNo}`;
        
        let followups: {
          sentAt: string;
          subject?: string;
          emailId?: string;
          graphMessageId?: string;
          importId?: string;
        }[] = [];
        const existingChase = await prisma.invoiceChase.findUnique({
          where: {
            userId_invoiceKey: {
              userId: user.id,
              invoiceKey: itemKey,
            },
          },
        });
        
        if (existingChase?.followupsJson) {
          try {
            followups = JSON.parse(existingChase.followupsJson);
          } catch {
            followups = [];
          }
        }

        followups.push({
          sentAt: now.toISOString(),
          subject: followSubject,
          ...(followupLogEmailId ? { emailId: followupLogEmailId } : {}),
          graphMessageId: graphFollowupId,
          importId,
        });

        updates.push(
          prisma.invoiceChase.update({
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
          })
        );
      }
    }

    await Promise.all(updates);

    return NextResponse.json({
      success: true,
      invoiceCount: lineItems.length,
      attachmentCount: attachments.length,
    });
  } catch (error) {
    console.error('[Aging Followup] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send follow-up';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
