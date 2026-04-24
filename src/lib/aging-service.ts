import * as XLSX from 'xlsx';
import { prisma } from './prisma';
import { shouldExcludeLineItem, getUserExclusionLookup } from './aging-exclusions';

function formatGenerationMonthFromDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/** Excel 1900 serial date → Date (UTC midnight), for cells read as numbers. */
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 800000) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

/** String for display from a cell; if it looks like an Excel date serial, format as month-year text. */
function cellToGenerationMonthString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    const d = excelSerialToDate(v);
    if (d) return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return String(v).trim();
  }
  const s = String(v).trim();
  if (!s) return '';
  const n = parseFloat(s.replace(/,/g, ''));
  if (!isNaN(n) && n > 20000 && n < 800000) {
    const d = excelSerialToDate(n);
    if (d) return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }
  return s;
}

/**
 * Find "Generation month" column with flexible header names (SAP / export variants).
 */
function extractGenerationMonthFromRow(row: string[], headers: string[]): string {
  const priority = extractCellValue(row, headers, [
    'Generation Month',
    'Generation month',
    'Generatn Month',
    'Gen Month',
    'Gen. Month',
    'Gen. month',
    'G/L Month',
    'GL Month',
    'G / L Month',
    'GenMnth',
    'Billing Month',
    'Inv Generation Month',
    'Invoice generation month',
  ]);
  if (priority) return cellToGenerationMonthString(priority);

  for (let j = 0; j < headers.length; j++) {
    const h = String(headers[j] ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!h) continue;
    const isGenMonthCol =
      (h.includes('generation') && h.includes('month')) ||
      h === 'gm' ||
      h === 'g m' ||
      (h.startsWith('gen') && h.includes('month') && h.length < 40) ||
      h.includes('g/l month') ||
      h.includes('gl month') ||
      h.includes('gen.month') ||
      (h.includes('gen') && h.includes('mnth')) ||
      (h.includes('invoice') && h.includes('gen') && h.includes('month'));
    if (!isGenMonthCol) continue;
    if (row[j] === undefined || row[j] === null || row[j] === '') continue;
    return cellToGenerationMonthString(row[j]);
  }
  return '';
}

/**
 * Core ageing data service for parsing Excel files and managing
 * invoice chase tracking across multiple ageing uploads.
 */

export interface ParsedAgingRow {
  companyCode: string;
  companyName: string;
  customerCode: string;
  customerName: string;
  reconAccount: string;
  reconAccountDescription: string;
  postingDate: Date | null;
  docDate: Date | null;
  netDueDate: Date | null;
  documentNo: string;
  documentType: string;
  refNo: string;
  invoiceRefNo: string;
  profitCenter: string;
  profitCenterDescr: string;
  specialGL: string;
  specialGLDescr: string;
  totalBalance: string;
  notDue: string;
  bucket0to30: string;
  bucket31to90: string;
  bucket91to180: string;
  bucket181to365: string;
  bucket366to730: string;
  bucket731to1095: string;
  bucket1096to1460: string;
  bucket1461to1845: string;
  bucketAbove1845: string;
  maxDaysBucket: string; // The highest bucket with a value
  paymentDate: Date | null;
  paymentDocNo: string;
  paymentAmount: string;
  fromBillDate: Date | null;
  fromDueDate: Date | null;
  weights: string;
  weightedDaysBillDate: string;
  weightedDaysDueDate: string;
  // Email from Excel
  emailTo: string;
  emailCc: string;
  rowIndex: number;
  /** From column e.g. "Generation Month", or empty (derived on import from posting/doc date) */
  generationMonth: string;
}

export interface ImportResult {
  importId: string;
  fileName: string;
  lineCount: number;
  excludedCount: number;
  chaseCount: number;
}

/**
 * Parse an ageing Excel file and extract all line items.
 * Handles the specific format with headers at row 9 and data from row 11.
 */
export function parseAgingExcel(fileBuffer: Buffer): ParsedAgingRow[] {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Get all rows including empty ones to determine structure
  const rawData = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    raw: false,
    defval: ''
  }) as string[][];
  
  // Find the header row (row 9 in the Excel file = index 8 in array)
  // Headers are typically at index 8 (0-based), data starts at index 10
  let headerRowIndex = -1;
  let dataStartIndex = -1;
  
  for (let i = 0; i < Math.min(15, rawData.length); i++) {
    const row = rawData[i];
    if (row && row.length > 0) {
      const rowStr = row.join(' ').toLowerCase();
      if (rowStr.includes('company code') && rowStr.includes('customer')) {
        headerRowIndex = i;
        dataStartIndex = i + 2; // Data starts 2 rows after headers
        break;
      }
    }
  }
  
  // Fallback: if not found, assume standard positions
  if (headerRowIndex === -1) {
    headerRowIndex = 8; // Row 9
    dataStartIndex = 10; // Row 11
  }
  
  const headers = (rawData[headerRowIndex] || []).map((c) => String(c ?? '').trim());
  const rows: ParsedAgingRow[] = [];
  
  for (let i = dataStartIndex; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length < 5) continue;

    const companyCode = extractCellValue(row, headers, ['Company Code', 'Co Code', 'Code']);
    const customerCode = extractCellValue(row, headers, ['Customer Code', 'Cust Code', 'Customer no.', 'Kunnr']) || '';
    const customerName =
      extractCellValue(row, headers, ['Customer Name', 'CustomerName', 'Customer name', 'Name of customer']) || '';

    // Do not import rows with no customer identity
    if (!String(customerName).trim() && !String(customerCode).trim()) {
      continue;
    }
    
    // Parse amounts and determine max bucket
    const buckets = {
      'Not due': extractAmount(row, headers, ['Not due', 'Not Due']),
      '0 - 30 days': extractAmount(row, headers, ['0 - 30 days', '0-30', '0 - 30']),
      '31 - 90 days': extractAmount(row, headers, ['31 - 90 days', '31-90', '31 - 90']),
      '91 - 180 days': extractAmount(row, headers, ['91 - 180 days', '91-180', '91 - 180']),
      '181 - 365 days': extractAmount(row, headers, ['181 - 365 days', '181-365', '181 - 365']),
      '366 - 730 days': extractAmount(row, headers, ['366 - 730 days', '366-730', '366 - 730']),
      '731 - 1095 days': extractAmount(row, headers, ['731 - 1095 days', '731-1095', '731 - 1095']),
      '1096 - 1460 days': extractAmount(row, headers, ['1096 - 1460 days', '1096-1460', '1096 - 1460']),
      '1461 - 1845 days': extractAmount(row, headers, ['1461 - 1845 days', '1461-1845', '1461 - 1845']),
      'Above 1845 days': extractAmount(row, headers, ['Above 1845 days', 'Above 1845', '>1845']),
    };
    
    // Find the bucket with the highest value
    let maxBucket = 'Not due';
    let maxAmount = 0;
    const bucketOrder = [
      'Not due',
      '0 - 30 days',
      '31 - 90 days',
      '91 - 180 days',
      '181 - 365 days',
      '366 - 730 days',
      '731 - 1095 days',
      '1096 - 1460 days',
      '1461 - 1845 days',
      'Above 1845 days',
    ];
    
    for (const [bucket, amount] of Object.entries(buckets)) {
      const numAmount = parseAmount(amount);
      if (numAmount > maxAmount) {
        maxAmount = numAmount;
        maxBucket = bucket;
      }
    }
    
    const totalBalance = extractAmount(row, headers, ['Total Balance', 'Total', 'Balance']);
    
    // Parse dates (format: DD.MM.YYYY)
    const postingDate = parseDate(extractCellValue(row, headers, ['Posting date', 'Posting Date']));
    const docDate = parseDate(extractCellValue(row, headers, ['Doc date', 'Doc Date', 'Document date']));
    const netDueDate = parseDate(extractCellValue(row, headers, ['Net Due date', 'Net Due Date', 'Due date']));
    const paymentDate = parseDate(extractCellValue(row, headers, ['Payment Date', 'Payment date']));
    const fromBillDate = parseDate(extractCellValue(row, headers, ['From Bill Date', 'From Bill']));
    const fromDueDate = parseDate(extractCellValue(row, headers, ['From Due Date', 'From Due']));
    
    // Parse emails (may be in a specific column or extracted from other fields)
    const emailTo = extractCellValue(row, headers, ['Email', 'emailTo', 'E-mail', 'Mail']) || '';
    const emailCc = extractCellValue(row, headers, ['emailCc', 'CC', 'Cc']) || '';
    const generationMonthRaw = extractGenerationMonthFromRow(row, headers);

    rows.push({
      companyCode: companyCode || '',
      companyName: extractCellValue(row, headers, ['Company Name', 'CompanyName']) || '',
      customerCode: customerCode || '',
      customerName,
      reconAccount: extractCellValue(row, headers, ['Recon A/c', 'Recon Account', 'Reconciliation']) || '',
      reconAccountDescription: extractCellValue(row, headers, ['Recon A/c Description', 'Recon Descr']) || '',
      postingDate,
      docDate,
      netDueDate,
      documentNo: extractCellValue(row, headers, ['Document No', 'Doc No', 'Document']) || '',
      documentType: extractCellValue(row, headers, ['Document Type', 'Doc Type']) || '',
      refNo: extractCellValue(row, headers, ['Ref No', 'Reference', 'Ref']) || '',
      invoiceRefNo: extractCellValue(row, headers, ['Invoice Ref No', 'Invoice Ref']) || '',
      profitCenter: extractCellValue(row, headers, ['Profit Center', 'ProfitCenter']) || '',
      profitCenterDescr: extractCellValue(row, headers, ['Profit Center Descr', 'PC Descr']) || '',
      specialGL: extractCellValue(row, headers, ['Special G/L', 'Special GL']) || '',
      specialGLDescr: extractCellValue(row, headers, ['Special G/L Descr', 'Special GL Descr']) || '',
      totalBalance,
      notDue: buckets['Not due'],
      bucket0to30: buckets['0 - 30 days'],
      bucket31to90: buckets['31 - 90 days'],
      bucket91to180: buckets['91 - 180 days'],
      bucket181to365: buckets['181 - 365 days'],
      bucket366to730: buckets['366 - 730 days'],
      bucket731to1095: buckets['731 - 1095 days'],
      bucket1096to1460: buckets['1096 - 1460 days'],
      bucket1461to1845: buckets['1461 - 1845 days'],
      bucketAbove1845: buckets['Above 1845 days'],
      maxDaysBucket: maxBucket,
      paymentDate,
      paymentDocNo: extractCellValue(row, headers, ['Payment Document Number', 'Payment Doc']) || '',
      paymentAmount: extractAmount(row, headers, ['Payment Amount']),
      fromBillDate,
      fromDueDate,
      weights: extractCellValue(row, headers, ['Weights', 'Weight']) || '',
      weightedDaysBillDate: extractCellValue(row, headers, ['Weighted days(Bill date)', 'Weighted Bill']) || '',
      weightedDaysDueDate: extractCellValue(row, headers, ['Weighted days(Due date)', 'Weighted Due']) || '',
      emailTo,
      emailCc,
      rowIndex: i,
      generationMonth: generationMonthRaw,
    });
  }

  return rows;
}

/**
 * Import parsed rows into the database.
 * Creates AgingImport, AgingLineItems, and upserts InvoiceChases.
 */
export async function importAgingData(
  userId: string,
  fileName: string,
  rows: ParsedAgingRow[]
): Promise<ImportResult> {
  // Create the import record
  const agingImport = await prisma.agingImport.create({
    data: {
      userId,
      fileName,
    },
  });
  
  let excludedCount = 0;
  let chaseCount = 0;

  const exclusionLookup = await getUserExclusionLookup(userId);

  // Process rows in batches to avoid memory issues
  const BATCH_SIZE = 100;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      // Check if should be excluded
      const isExcluded = await shouldExcludeLineItem(
        row.companyCode,
        row.customerCode,
        row.reconAccountDescription,
        undefined,
        row.customerName,
        exclusionLookup
      );
      
      if (isExcluded) {
        excludedCount++;
      }
      
      // Create the line item
      const lineItem = await prisma.agingLineItem.create({
        data: {
          importId: agingImport.id,
          userId,
          companyCode: row.companyCode,
          companyName: row.companyName,
          customerCode: row.customerCode,
          customerName: row.customerName,
          documentNo: row.documentNo,
          refNo: row.refNo,
          totalBalance: row.totalBalance,
          notDue: row.notDue,
          maxDaysBucket: row.maxDaysBucket,
          docDate: row.docDate,
          postingDate: row.postingDate,
          netDueDate: row.netDueDate,
          generationMonth:
            row.generationMonth?.trim() ||
            formatGenerationMonthFromDate(row.postingDate) ||
            formatGenerationMonthFromDate(row.docDate) ||
            null,
          emailTo: row.emailTo,
          emailCc: row.emailCc,
          customerNameKey: (row.customerName || row.customerCode).toLowerCase().trim(),
          excluded: isExcluded,
          rowIndex: row.rowIndex,
        },
      });
      
      // Upsert InvoiceChase for invoice-level tracking
      if (row.documentNo && !isExcluded) {
        const invoiceKey = `${row.companyCode}-${row.documentNo}`;
        
        const chase = await prisma.invoiceChase.upsert({
          where: {
            userId_invoiceKey: {
              userId,
              invoiceKey,
            },
          },
          create: {
            userId,
            invoiceKey,
            companyCode: row.companyCode,
            companyName: row.companyName,
            customerCode: row.customerCode,
            customerName: row.customerName,
            documentNo: row.documentNo,
            amountSnapshot: row.totalBalance,
            emailTo: row.emailTo,
            emailCc: row.emailCc,
            lastImportId: agingImport.id,
            status: 'outstanding',
          },
          update: {
            amountSnapshot: row.totalBalance,
            emailTo: row.emailTo || undefined,
            emailCc: row.emailCc || undefined,
            lastImportId: agingImport.id,
          },
        });

        // Link line item to chase (FK is InvoiceChase.id, not invoiceKey)
        await prisma.agingLineItem.update({
          where: { id: lineItem.id },
          data: { invoiceChaseId: chase.id },
        });
        
        chaseCount++;
      }
    }
  }
  
  return {
    importId: agingImport.id,
    fileName,
    lineCount: rows.length,
    excludedCount,
    chaseCount,
  };
}

/**
 * Get customer groups for a specific import.
 */
export async function getCustomerGroups(
  userId: string,
  importId: string,
  grouping: 'name' | 'code',
  companyCode?: string
): Promise<
  Array<{
    groupKey: string;
    lineItemIds: string[];
    lineCount: number;
    emailTo: string;
    emailConflict: boolean;
    companyName: string;
    customerName: string;
    customerCode: string;
    /** max emailCount on any line in the group (initial sends) */
    emailCount: number;
    followupCount: number;
    /** Sum of (emailCount + followupCount) per line, for "emails" column */
    totalEmailsCount: number;
    lastSentAt: string | null;
    hasResponse: boolean;
    /** true if at least one line has a sent message and no reply (bulk follow-up candidate) */
    hasUnansweredSent: boolean;
  }>
> {
  const lineItems = await prisma.agingLineItem.findMany({
    where: {
      importId,
      userId,
      excluded: false,
      ...(companyCode ? { companyCode } : {}),
    },
    orderBy: { customerName: 'asc' },
  });

  const keys = new Set<string>();
  for (const it of lineItems) {
    if (it.documentNo) keys.add(`${it.companyCode}-${it.documentNo}`);
  }
  const chases =
    keys.size > 0
      ? await prisma.invoiceChase.findMany({
          where: { userId, invoiceKey: { in: [...keys] } },
        })
      : [];
  const chaseByKey = new Map(chases.map((c) => [c.invoiceKey, c]));

  // Group by the specified key
  const groups = new Map<
    string,
    {
      lineItemIds: string[];
      emails: Set<string>;
      companyName: string;
      customerName: string;
      customerCode: string;
      emailCount: number;
      followupCount: number;
      totalEmailsCount: number;
      lastSentAt: Date | null;
      hasResponse: boolean;
      hasUnansweredSent: boolean;
      /** Sum of line totalBalance (numeric); used to drop non-positive groups from bulk email */
      groupTotalBalance: number;
    }
  >();

  for (const item of lineItems) {
    const key =
      grouping === 'name' ? item.customerName.toLowerCase().trim() : item.customerCode.toLowerCase().trim();

    if (!key) continue;

    const iKey = item.documentNo ? `${item.companyCode}-${item.documentNo}` : '';
    const c = iKey ? chaseByKey.get(iKey) : undefined;
    const ec = c?.emailCount ?? 0;
    const fc = c?.followupCount ?? 0;
    const lineTotal = ec + fc;
    const lineLast =
      c?.lastFollowupAt && c?.sentAt
        ? c.lastFollowupAt > c.sentAt
          ? c.lastFollowupAt
          : c.sentAt
        : c?.lastFollowupAt ?? c?.sentAt ?? null;
    const lineHasResp = c?.lastResponseAt != null;
    const lineUnanswered = !!(c?.sentMessageId && !c?.lastResponseAt);

    if (!groups.has(key)) {
      groups.set(key, {
        lineItemIds: [],
        emails: new Set(),
        companyName: item.companyName,
        customerName: item.customerName,
        customerCode: item.customerCode,
        emailCount: 0,
        followupCount: 0,
        totalEmailsCount: 0,
        lastSentAt: null,
        hasResponse: false,
        hasUnansweredSent: false,
        groupTotalBalance: 0,
      });
    }

    const group = groups.get(key)!;
    group.lineItemIds.push(item.id);
    group.groupTotalBalance += parseAmount(item.totalBalance ?? '');
    if (item.emailTo) {
      group.emails.add(item.emailTo.toLowerCase().trim());
    }
    group.emailCount = Math.max(group.emailCount, ec);
    group.followupCount = Math.max(group.followupCount, fc);
    group.totalEmailsCount += lineTotal;
    if (lineLast) {
      if (!group.lastSentAt || lineLast > group.lastSentAt) {
        group.lastSentAt = lineLast;
      }
    }
    if (lineHasResp) {
      group.hasResponse = true;
    }
    if (lineUnanswered) {
      group.hasUnansweredSent = true;
    }
  }

  // Drop groups with no positive receivable total (bulk email / UI should not show them)
  return Array.from(groups.entries())
    .filter(([, data]) => data.groupTotalBalance > 0)
    .map(([groupKey, data]) => ({
    groupKey,
    lineItemIds: data.lineItemIds,
    lineCount: data.lineItemIds.length,
    emailTo: Array.from(data.emails)[0] || '',
    emailConflict: data.emails.size > 1,
    companyName: data.companyName,
    customerName: data.customerName,
    customerCode: data.customerCode,
    emailCount: data.emailCount,
    followupCount: data.followupCount,
    totalEmailsCount: data.totalEmailsCount,
    lastSentAt: data.lastSentAt ? data.lastSentAt.toISOString() : null,
    hasResponse: data.hasResponse,
    hasUnansweredSent: data.hasUnansweredSent,
  }));
}

/**
 * Get distinct customers for attachment UI.
 */
export async function getDistinctCustomers(
  userId: string,
  importId: string
): Promise<Array<{
  label: string;
  customerName: string;
  customerCode: string;
  companyName: string;
}>> {
  const lineItems = await prisma.agingLineItem.findMany({
    where: {
      importId,
      userId,
      excluded: false,
    },
    select: {
      customerName: true,
      customerCode: true,
      companyName: true,
    },
    distinct: ['customerName', 'customerCode'],
    orderBy: { customerName: 'asc' },
  });
  
  return lineItems.map(item => ({
    label: `${item.customerName} (${item.customerCode})`,
    customerName: item.customerName,
    customerCode: item.customerCode,
    companyName: item.companyName,
  }));
}

/**
 * Get line items for a specific group.
 */
export async function getLineItemsForGroup(
  userId: string,
  importId: string,
  lineItemIds: string[]
): Promise<
  Array<{
    id: string;
    companyCode: string;
    companyName: string;
    customerCode: string;
    customerName: string;
    documentNo: string;
    refNo: string | null;
    totalBalance: string | null;
    maxDaysBucket: string;
    docDate: Date | null;
    postingDate: Date | null;
    netDueDate: Date | null;
    generationMonth: string | null;
    emailTo: string;
    emailCc: string;
  }>
> {
  const items = await prisma.agingLineItem.findMany({
    where: {
      id: { in: lineItemIds },
      userId,
      importId,
      excluded: false,
    },
    orderBy: [{ docDate: 'asc' }, { documentNo: 'asc' }],
  });
  
  return items.map((item) => ({
    id: item.id,
    companyCode: item.companyCode,
    companyName: item.companyName,
    customerCode: item.customerCode,
    customerName: item.customerName,
    documentNo: item.documentNo,
    refNo: item.refNo,
    totalBalance: item.totalBalance,
    maxDaysBucket: item.maxDaysBucket || '',
    docDate: item.docDate,
    postingDate: item.postingDate,
    netDueDate: item.netDueDate,
    generationMonth: item.generationMonth,
    emailTo: item.emailTo,
    emailCc: item.emailCc,
  }));
}

/**
 * Parse amount string (handles comma as thousands separator).
 */
function parseAmount(amountStr: string | null | undefined): number {
  if (!amountStr) return 0;
  // Remove commas, keep decimal point
  const cleaned = String(amountStr).replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Sum of line `totalBalance` for bulk/preview guard rails (must match getCustomerGroups rule). */
export function sumLineItemsTotalBalance(
  items: { totalBalance: string | null }[]
): number {
  return items.reduce((s, it) => s + parseAmount(it.totalBalance), 0);
}

/**
 * Extract amount from row using possible header names.
 */
function extractAmount(row: string[], headers: string[], possibleNames: string[]): string {
  for (const name of possibleNames) {
    const index = headers.findIndex(h => 
      h.toLowerCase().trim() === name.toLowerCase().trim()
    );
    if (index >= 0 && row[index] !== undefined) {
      return String(row[index]).trim();
    }
  }
  return '';
}

/**
 * Extract cell value from row using possible header names.
 */
function extractCellValue(row: string[], headers: string[], possibleNames: string[]): string {
  for (const name of possibleNames) {
    const index = headers.findIndex(h => {
      const headerLower = h.toLowerCase().trim();
      const nameLower = name.toLowerCase().trim();
      return headerLower === nameLower || headerLower.includes(nameLower);
    });
    if (index >= 0 && row[index] !== undefined) {
      const value = String(row[index]).trim();
      if (value && value !== 'undefined' && value !== 'null') {
        return value;
      }
    }
  }
  return '';
}

/**
 * Parse date string in DD.MM.YYYY format.
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  const asNum = parseFloat(trimmed.replace(/,/g, ''));
  if (!isNaN(asNum) && asNum > 20000 && asNum < 800000) {
    const fromSerial = excelSerialToDate(asNum);
    if (fromSerial) return fromSerial;
  }

  // Try DD.MM.YYYY format
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed
    const year = parseInt(parts[2], 10);
    
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const date = new Date(year, month, day);
      if (date.getMonth() === month) { // Validate month
        return date;
      }
    }
  }
  
  // Try standard date parsing as fallback
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  return null;
}

/**
 * Check if a bucket is considered "long overdue".
 */
export function isLongOverdueBucket(bucket: string): boolean {
  const longOverdueBuckets = [
    '91 - 180 days',
    '181 - 365 days',
    '366 - 730 days',
    '731 - 1095 days',
    '1096 - 1460 days',
    '1461 - 1845 days',
    'Above 1845 days',
  ];
  return longOverdueBuckets.includes(bucket);
}

export { AGING_BUCKETS_IN_ORDER, getBucketDays } from './aging-bucket-utils';
