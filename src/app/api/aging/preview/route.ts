import { NextRequest, NextResponse } from 'next/server';
import { getLineItemsForGroup, sumLineItemsTotalBalance } from '@/lib/aging-service';
import {
  generateDefaultEmailBody,
  generateEmailSubject,
  generateFollowupEmailBody,
  generateFollowupSubject,
  EmailTemplateData,
  mapLineItemsToInvoiceRows,
} from '@/lib/aging-templates';
import { getCurrentUser } from '@/lib/simple-auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { importId, lineItemIds, grouping, customerName, customerCode, companyName, mode } = body;

    if (!importId || !lineItemIds || !Array.isArray(lineItemIds) || lineItemIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameters: importId, lineItemIds' },
        { status: 400 }
      );
    }

    // Get line items
    const lineItems = await getLineItemsForGroup(user.id, importId, lineItemIds);

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'No line items found (or excluded from receivables)' }, { status: 404 });
    }
    if (sumLineItemsTotalBalance(lineItems) <= 0) {
      return NextResponse.json(
        { error: 'No positive total balance for these line items' },
        { status: 400 }
      );
    }

    const invRows = mapLineItemsToInvoiceRows(lineItems);
    const templateData: EmailTemplateData = {
      customerName: customerName || lineItems[0].customerName,
      customerCode: customerCode || lineItems[0].customerCode,
      companyName: companyName || lineItems[0].companyName,
      invoices: invRows,
      totalAmount: lineItems.reduce((sum, item) => {
        const amount = item.totalBalance ? parseFloat(item.totalBalance.replace(/,/g, '')) : 0;
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0).toString(),
    };

    const isFollowup = mode === 'followup';
    const subject = isFollowup ? generateFollowupSubject(templateData) : generateEmailSubject(templateData);
    const htmlBody = isFollowup
      ? generateFollowupEmailBody(templateData)
      : generateDefaultEmailBody(templateData);

    return NextResponse.json({
      subject,
      htmlBody,
      plainText: '',
      invoiceCount: lineItems.length,
      customerName: templateData.customerName,
      totalAmount: templateData.totalAmount,
      invoices: invRows.map((inv, i) => ({
        documentNo: inv.documentNo,
        customerName: inv.customerName,
        docDate: inv.docDate,
        generationMonth: inv.generationMonth,
        totalBalance: inv.totalBalance,
        maxDaysBucket: inv.maxDaysBucket || '',
        customerCode: lineItems[i]!.customerCode,
        companyName: lineItems[i]!.companyName,
      })),
    });
  } catch (error) {
    console.error('[Aging Preview] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate preview';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
