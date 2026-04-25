import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GraphMailService } from '@/lib/graph-mail-service';
import { getLineItemsForGroup, type OutreachRoundEntry } from '@/lib/aging-service';
import { getEmailForCustomer } from '@/lib/customer-email-directory';
import { isPlausibleEmailAddress, splitStoredEmails } from '@/lib/email-parser';
import { getCurrentUser } from '@/lib/simple-auth';
import { collectAgingSendAttachments } from '@/lib/aging-import-attachments';
import { stripHtmlToPlain } from '@/lib/aging-bulk-form';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { importId, lineItemIds, subject, htmlBody, cc, grouping, customerName, customerCode } = body;

    if (!importId || !lineItemIds || !Array.isArray(lineItemIds) || lineItemIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (!subject || !htmlBody) {
      return NextResponse.json(
        { error: 'Subject and email body are required' },
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
        { error: 'No active email configuration found. Please configure Microsoft Graph first.' },
        { status: 400 }
      );
    }

    // Prefer customer email directory, then sheet
    const firstItem = lineItems[0];
    const directoryEmail = await getEmailForCustomer(
      user.id,
      customerCode || firstItem.customerCode,
      customerName || firstItem.customerName,
      grouping === 'code' ? 'code' : 'name'
    );
    const dirTo = directoryEmail?.emailTo?.trim();
    let recipientEmail = dirTo || firstItem.emailTo;
    const emailSource =
      dirTo && directoryEmail ? directoryEmail.source : 'sheet';
    const directoryCc: string | null = dirTo
      ? (directoryEmail?.emailCc?.trim() || null)
      : null;

    if (!recipientEmail) {
      return NextResponse.json(
        { error: 'No email address found for this customer. Please add an email in Customer Emails page.' },
        { status: 400 }
      );
    }

    // Parse multiple TO addresses
    const toAddresses = splitStoredEmails(recipientEmail).filter(isPlausibleEmailAddress);
    if (toAddresses.length === 0) {
      return NextResponse.json(
        { error: 'No valid email address found for this customer. Check the address format (e.g. name@domain.com).' },
        { status: 400 }
      );
    }

    // Merge CC: manual, directory (when used), or sheet line CC as fallback
    const ccParts: string[] = [];
    if (cc) ccParts.push(...splitStoredEmails(cc));
    if (directoryCc) ccParts.push(...splitStoredEmails(directoryCc));
    if (!dirTo && firstItem.emailCc) {
      ccParts.push(...splitStoredEmails(firstItem.emailCc));
    }
    // Deduplicate and remove any addresses already in TO
    const toSet = new Set(toAddresses);
    const mergedCc = [...new Set(ccParts)].filter((e) => !toSet.has(e));

    const importAtts = await prisma.agingImportCustomerAttachment.findMany({
      where: { userId: user.id, importId },
    });
    const importMap = new Map(
      importAtts.map((r) => [r.customerCode, { filePath: r.filePath, fileName: r.fileName }])
    );
    const attachments = await collectAgingSendAttachments(user.id, firstItem, importMap);

    // Send email via Graph API
    const sendResult = await GraphMailService.sendMail(emailConfig, {
      to: toAddresses.length === 1 ? toAddresses[0]! : toAddresses,
      subject,
      htmlBody,
      cc: mergedCc.length > 0 ? mergedCc : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    const sentMessageId = (sendResult.id || '').trim();
    if (!sentMessageId) {
      return NextResponse.json(
        {
          error:
            'Microsoft Graph did not return a message id. The message may not be in the mailbox; nothing was saved.',
        },
        { status: 502 }
      );
    }

    // Update InvoiceChase records
    const now = new Date();
    const updates: Promise<unknown>[] = [];

    for (const item of lineItems) {
      if (item.documentNo) {
        const invoiceKey = `${item.companyCode}-${item.documentNo}`;
        
        // Get existing chase to check if this is a new import send
        const existingChase = await prisma.invoiceChase.findUnique({
          where: {
            userId_invoiceKey: {
              userId: user.id,
              invoiceKey,
            },
          },
        });

        // Parse current outreach rounds
        let outreachRounds: OutreachRoundEntry[] = [];
        if (existingChase?.outreachRoundsJson) {
          try {
            outreachRounds = JSON.parse(existingChase.outreachRoundsJson) as OutreachRoundEntry[];
          } catch {
            outreachRounds = [];
          }
        }

        const roundIdx = outreachRounds.findIndex((r) => r.importId === importId);
        const roundEntry: OutreachRoundEntry = {
          importId,
          sentAt: now.toISOString(),
          sentMessageId,
        };
        if (roundIdx >= 0) {
          outreachRounds[roundIdx] = {
            ...outreachRounds[roundIdx]!,
            sentAt: outreachRounds[roundIdx]!.sentAt || roundEntry.sentAt,
            sentMessageId: sentMessageId || outreachRounds[roundIdx]!.sentMessageId,
          };
        } else {
          outreachRounds.push(roundEntry);
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
              lastAgingSendFailedAt: null,
              lastAgingSendError: null,
            },
          })
        );
      }
    }

    await Promise.all(updates);

    const firstWithDoc = lineItems.find((it) => it.documentNo);
    const firstDocKey = firstWithDoc
      ? `${firstWithDoc.companyCode}-${firstWithDoc.documentNo}`
      : null;
    try {
      await prisma.email.create({
        data: {
          to: toAddresses.join(', '),
          subject,
          body: htmlBody ? stripHtmlToPlain(htmlBody) : null,
          htmlBody,
          status: 'sent',
          errorMessage: null,
          emailConfigId: emailConfig.id,
          userId: user.id,
          agingInvoiceKey: firstDocKey,
          kind: 'aging_initial',
          agingImportId: importId,
        },
      });
    } catch (e) {
      console.error('[Aging Send] email log create:', e);
    }

    return NextResponse.json({
      success: true,
      sentMessageId,
      recipientEmail,
      emailSource,
      attachmentCount: attachments.length,
      invoiceCount: lineItems.length,
    });
  } catch (error) {
    console.error('[Aging Send] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
