import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GraphMailService } from '@/lib/graph-mail-service';
import { getLineItemsForGroup } from '@/lib/aging-service';
import { getEmailForCustomer } from '@/lib/customer-email-directory';
import { splitStoredEmails } from '@/lib/email-parser';
import { getCurrentUser } from '@/lib/simple-auth';
import { collectAgingSendAttachments } from '@/lib/aging-import-attachments';

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
    const toAddresses = splitStoredEmails(recipientEmail);
    if (toAddresses.length === 0) {
      return NextResponse.json(
        { error: 'No valid email address found for this customer.' },
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

    const sentMessageId = sendResult.id || '';

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
        let outreachRounds: { importId: string; sentAt: string }[] = [];
        if (existingChase?.outreachRoundsJson) {
          try {
            outreachRounds = JSON.parse(existingChase.outreachRoundsJson);
          } catch {
            outreachRounds = [];
          }
        }

        // Check if we've already recorded a send for this import
        const existingRound = outreachRounds.find(r => r.importId === importId);
        
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
