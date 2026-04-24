/**
 * Email template utilities for ageing/receivables follow-up emails.
 * Generates invoice table HTML and provides default email body templates.
 */

/** One row in the ageing email invoice table (bulk send, bulk follow-up, and single send). */
export interface InvoiceRow {
  documentNo: string;
  totalBalance?: string | null;
  customerName?: string;
  /** Display e.g. "15 Jan 2024" or "—" */
  docDate?: string | null;
  /** Milliseconds for sorting; 0 if unknown */
  docDateSortKey?: number;
  generationMonth?: string | null;
  /** Used by summary / plain-text; optional on legacy data */
  maxDaysBucket?: string;
  refNo?: string | null;
  companyName?: string;
}

export interface EmailTemplateData {
  customerName: string;
  customerCode: string;
  companyName: string;
  invoices: InvoiceRow[];
  totalAmount: string;
  senderName?: string;
  senderCompany?: string;
}

export type LineItemForTemplate = {
  documentNo: string;
  customerName: string;
  totalBalance: string | null;
  maxDaysBucket: string;
  docDate: Date | null;
  generationMonth: string | null;
};

/**
 * Map DB line items to template rows (shared by bulk send, follow-up, preview APIs).
 */
export function mapLineItemsToInvoiceRows(items: LineItemForTemplate[]): InvoiceRow[] {
  return items.map((item) => ({
    documentNo: item.documentNo,
    customerName: item.customerName,
    totalBalance: item.totalBalance,
    maxDaysBucket: item.maxDaysBucket,
    docDate: item.docDate ? formatDocDateDisplay(item.docDate) : '—',
    docDateSortKey: item.docDate ? item.docDate.getTime() : 0,
    generationMonth: item.generationMonth?.trim() || '—',
  }));
}

function formatDocDateDisplay(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Invoice table: Doc date, Customer Name, Generation Month, Document No, Total Balance.
 */
export function generateInvoiceTable(invoices: InvoiceRow[]): string {
  if (!invoices || invoices.length === 0) {
    return '<p>No outstanding invoices found.</p>';
  }

  const sorted = [...invoices].sort((a, b) => {
    const ta = a.docDateSortKey ?? 0;
    const tb = b.docDateSortKey ?? 0;
    if (ta !== tb) return ta - tb;
    return a.documentNo.localeCompare(b.documentNo, undefined, { numeric: true });
  });

  const rows = sorted
    .map(
      (inv) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 13px; color: #374151;">${escapeHtml(inv.docDate || '—')}</td>
      <td style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 13px; color: #374151;">${escapeHtml(inv.customerName || '—')}</td>
      <td style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 13px; color: #374151;">${escapeHtml(inv.generationMonth || '—')}</td>
      <td style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 13px; color: #374151;">${escapeHtml(inv.documentNo)}</td>
      <td style="padding: 8px 12px; font-family: Arial, sans-serif; font-size: 13px; text-align: right; color: #374151;">${formatAmount(inv.totalBalance)}</td>
    </tr>
  `
    )
    .join('');

  return `
<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
  <thead>
    <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
      <th style="padding: 10px 12px; text-align: left; font-family: Arial, sans-serif; font-size: 12px; font-weight: 600; color: #4b5563; text-transform: uppercase;">Doc date</th>
      <th style="padding: 10px 12px; text-align: left; font-family: Arial, sans-serif; font-size: 12px; font-weight: 600; color: #4b5563; text-transform: uppercase;">Customer Name</th>
      <th style="padding: 10px 12px; text-align: left; font-family: Arial, sans-serif; font-size: 12px; font-weight: 600; color: #4b5563; text-transform: uppercase;">Generation Month</th>
      <th style="padding: 10px 12px; text-align: left; font-family: Arial, sans-serif; font-size: 12px; font-weight: 600; color: #4b5563; text-transform: uppercase;">Document No</th>
      <th style="padding: 10px 12px; text-align: right; font-family: Arial, sans-serif; font-size: 12px; font-weight: 600; color: #4b5563; text-transform: uppercase;">Total Balance</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
  `.trim();
}

/**
 * Generate a summary row for the email.
 */
export function generateSummaryRow(invoices: InvoiceRow[]): string {
  const total = invoices.reduce((sum, inv) => {
    return sum + parseAmount(inv.totalBalance);
  }, 0);
  
  const count = invoices.length;
  const oldestBucket = invoices.reduce((oldest, inv) => {
    const b = inv.maxDaysBucket || 'Not due';
    const days = getBucketDays(b);
    const oldestDays = getBucketDays(oldest);
    return days > oldestDays ? b : oldest;
  }, 'Not due');
  
  return `
<div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; font-family: Arial, sans-serif;">
  <p style="margin: 0 0 4px 0; font-size: 14px; color: #374151;">
    <strong>Total Outstanding:</strong> ${formatCurrency(total)}
  </p>
  <p style="margin: 0 0 4px 0; font-size: 14px; color: #374151;">
    <strong>Number of Invoices:</strong> ${count}
  </p>
  <p style="margin: 0; font-size: 14px; color: #374151;">
    <strong>Oldest Age Bucket:</strong> <span style="color: ${getBucketColor(oldestBucket)};">${oldestBucket}</span>
  </p>
</div>
  `.trim();
}

/**
 * Generate the default email body template.
 */
export function generateDefaultEmailBody(data: EmailTemplateData): string {
  const table = generateInvoiceTable(data.invoices);
  const total = data.invoices.reduce((sum, inv) => sum + parseAmount(inv.totalBalance), 0);
  const totalFormatted = formatCurrency(total);
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 800px; margin: 0 auto; padding: 20px;">
  
  <p>Hi Team,</p>
  
  <p>As per the email, please find below the list of outstanding invoices for which payment has not yet been received. We are attaching the invoice copies for your reference.</p>
  
  <p>Kindly review the details and process the payment at the earliest. If the payment has already been released, we request you to share the UTR details to help us reconcile with our accounts team.</p>
  
  <p>Your prompt attention to this matter is highly appreciated.</p>
  
  ${table}
  
  <p style="margin: 16px 0; font-size: 14px;"><strong>Total outstanding:</strong> ${totalFormatted}</p>
  
  <p style="margin-top: 32px;">
    Warm regards,<br>
    ${escapeHtml(data.senderName || 'Accounts Receivable Team')}<br>
    ${escapeHtml(data.senderCompany || data.companyName)}
  </p>
  
</body>
</html>`;
}

/**
 * Generate a follow-up email body (same table layout as initial send; different intro copy).
 */
export function generateFollowupEmailBody(data: EmailTemplateData): string {
  const table = generateInvoiceTable(data.invoices);
  const total = data.invoices.reduce((sum, inv) => sum + parseAmount(inv.totalBalance), 0);
  const totalFormatted = formatCurrency(total);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 800px; margin: 0 auto; padding: 20px;">

  <p>Hi Team,</p>

  <p>As per our records, a long outstanding amount is still pending. We kindly request you to clear the same at the earliest. In case the payment has already been made, please share the transaction details with us for reconciliation. Your support in closing this overdue balance will be much appreciated.</p>

  ${table}

  <p style="margin: 16px 0; font-size: 14px;"><strong>Total outstanding:</strong> ${totalFormatted}</p>

  <p style="margin-top: 32px;">
    Warm regards,<br>
    ${escapeHtml(data.senderName || 'Accounts Receivable Team')}<br>
    ${escapeHtml(data.senderCompany || data.companyName)}
  </p>

</body>
</html>`;
}

/**
 * Generate subject line for initial send.
 */
export function generateEmailSubject(data: EmailTemplateData): string {
  const co = data.companyName?.trim() || 'your account';
  const count = data.invoices.length;
  const total = data.invoices.reduce((sum, inv) => sum + parseAmount(inv.totalBalance), 0);
  if (count === 1) {
    return `Payment follow-up — outstanding invoice ${data.invoices[0].documentNo} / ${co} (${formatCurrency(total)})`;
  }
  return `Payment follow-up — ${count} outstanding invoices / ${co} (${formatCurrency(total)})`;
}

/**
 * Generate subject line for follow-up.
 */
export function generateFollowupSubject(data: EmailTemplateData): string {
  const co = data.companyName?.trim() || 'your account';
  const count = data.invoices.length;
  const total = data.invoices.reduce((sum, inv) => sum + parseAmount(inv.totalBalance), 0);
  if (count === 1) {
    return `Reminder: outstanding invoice ${data.invoices[0].documentNo} — ${co} (${formatCurrency(total)})`;
  }
  return `Reminder: outstanding invoices (${count}) — ${co} (${formatCurrency(total)})`;
}

/**
 * Generate a plain text version of the email (for clients that don't support HTML).
 */
export function generatePlainTextBody(data: EmailTemplateData): string {
  const total = data.invoices.reduce((sum, inv) => sum + parseAmount(inv.totalBalance), 0);

  let text = `Hi Team,\n\n`;
  text += `Please find below outstanding invoice line items.\n\n`;
  text += `Total outstanding: ${formatCurrency(total)} (${data.invoices.length} line(s))\n\n`;
  text += `Doc date | Customer | Generation Month | Document No | Total balance\n`;
  text += `---------------------------------------------------------------------\n`;

  for (const inv of data.invoices) {
    text += `${inv.docDate || '—'} | ${inv.customerName || '—'} | ${inv.generationMonth || '—'} | ${inv.documentNo} | ${formatAmount(inv.totalBalance)}\n`;
  }

  text += `\nWarm regards,\n${data.senderName || 'Accounts Receivable Team'}\n${data.senderCompany || data.companyName}\n`;
  return text;
}

/**
 * Helper: Escape HTML entities.
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Helper: Format amount with currency symbol.
 */
function formatCurrency(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Helper: Format amount string.
 */
function formatAmount(amountStr: string | undefined | null): string {
  if (!amountStr) return '-';
  const amount = parseAmount(amountStr);
  if (amount === 0) return '-';
  return formatCurrency(amount);
}

/**
 * Helper: Parse amount string.
 */
function parseAmount(amountStr: string | undefined | null): number {
  if (!amountStr) return 0;
  const cleaned = amountStr.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Helper: Get color for bucket based on severity.
 */
function getBucketColor(bucket: string): string {
  const colors: Record<string, string> = {
    'Not due': '#10b981', // Green
    '0 - 30 days': '#10b981', // Green
    '31 - 90 days': '#f59e0b', // Yellow
    '91 - 180 days': '#f97316', // Orange
    '181 - 365 days': '#ef4444', // Red
    '366 - 730 days': '#dc2626', // Dark Red
    '731 - 1095 days': '#b91c1c', // Darker Red
    '1096 - 1460 days': '#991b1b', // Very Dark Red
    '1461 - 1845 days': '#7f1d1d', // Extremely Dark Red
    'Above 1845 days': '#450a0a', // Almost Black
  };
  return colors[bucket] || '#6b7280';
}

/**
 * Helper: Get numeric days from bucket.
 */
function getBucketDays(bucket: string): number {
  const days: Record<string, number> = {
    'Not due': 0,
    '0 - 30 days': 15,
    '31 - 90 days': 60,
    '91 - 180 days': 135,
    '181 - 365 days': 273,
    '366 - 730 days': 548,
    '731 - 1095 days': 913,
    '1096 - 1460 days': 1278,
    '1461 - 1845 days': 1653,
    'Above 1845 days': 2000,
  };
  return days[bucket] || 0;
}
