import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GraphMailService } from '@/lib/graph-mail-service';
import { getLineItemsForGroup } from '@/lib/aging-service';
import {
  generateFollowupEmailBody,
  generateFollowupSubject,
  EmailTemplateData,
  mapLineItemsToInvoiceRows,
} from '@/lib/aging-templates';
import { getCurrentUser } from '@/lib/simple-auth';
import { collectAgingSendAttachments } from '@/lib/aging-import-attachments';

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

    if (!chase?.sentMessageId) {
      return NextResponse.json(
        { error: 'No original email found to reply to. Please send an initial email first.' },
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

    const graphFollowupId = await GraphMailService.replyToMessage(
      emailConfig,
      chase.sentMessageId,
      {
        to: chase.emailTo || firstItem.emailTo,
        htmlBody: followupBody,
        cc: cc || chase.emailCc || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
    );

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
          graphMessageId: graphFollowupId,
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
