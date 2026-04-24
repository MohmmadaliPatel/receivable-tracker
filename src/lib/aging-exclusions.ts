import * as XLSX from 'xlsx';
import { readFile } from 'fs/promises';
import { prisma } from './prisma';

/**
 * Internal company exclusion logic for ageing reports.
 * Parses Cleanmax_Login.xlsx to identify internal company codes
 * that should be excluded from receivables tracking.
 */

interface InternalCompany {
  companyCode: string;
  companyName: string;
  customerCode: string;
}

let cachedExclusions: Set<string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Parse the Cleanmax_Login.xlsx file to extract internal company codes.
 * The file is expected to be in the public directory.
 */
export async function loadInternalCompanies(filePath: string = 'public/Cleanmax_Login.xlsx'): Promise<InternalCompany[]> {
  try {
    const fileBuffer = await readFile(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with raw values
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: true }) as Record<string, unknown>[];
    
    const companies: InternalCompany[] = [];
    
    for (const row of data) {
      // Try to identify columns dynamically - common patterns in SAP exports
      const companyCode = extractStringValue(row, ['Company Code', 'CompanyCode', 'Code', 'code', 'Co Code']);
      const companyName = extractStringValue(row, ['Company Name', 'CompanyName', 'Name', 'Comp Name']);
      const customerCode = extractStringValue(row, ['Customer Code', 'CustomerCode', 'Cust Code', 'Customer']);
      
      if (companyCode || customerCode) {
        companies.push({
          companyCode: companyCode || customerCode || '',
          companyName: companyName || '',
          customerCode: customerCode || companyCode || '',
        });
      }
    }
    
    return companies;
  } catch (error) {
    console.error('[AgingExclusions] Failed to load internal companies:', error);
    return [];
  }
}

/**
 * Get a set of internal company codes for fast lookup.
 * Uses caching to avoid repeated file reads.
 */
export async function getInternalCompanyCodes(filePath?: string): Promise<Set<string>> {
  const now = Date.now();
  
  if (cachedExclusions && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedExclusions;
  }
  
  const companies = await loadInternalCompanies(filePath);
  const codes = new Set<string>();
  
  for (const company of companies) {
    if (company.companyCode) {
      codes.add(company.companyCode.toString().trim());
    }
    if (company.customerCode) {
      codes.add(company.customerCode.toString().trim());
    }
  }
  
  cachedExclusions = codes;
  cacheTimestamp = now;
  
  return codes;
}

export type UserExclusionLookup = { nameSet: Set<string>; codeSet: Set<string> };

const INTER_UNIT_INDICATORS = [
  'inter unit',
  'inter-unit',
  'branch transfer',
  'internal',
  'intercompany',
  'inter-company',
] as const;

/**
 * Load per-user excluded customers (by name or code) for import-time checks.
 */
export async function getUserExclusionLookup(userId: string): Promise<UserExclusionLookup> {
  const rows = await prisma.excludedCustomer.findMany({
    where: { userId },
    select: { keyType: true, keyValue: true },
  });
  const nameSet = new Set<string>();
  const codeSet = new Set<string>();
  for (const r of rows) {
    if (r.keyType === 'customer_name') nameSet.add(r.keyValue);
    else if (r.keyType === 'customer_code') codeSet.add(r.keyValue);
  }
  return { nameSet, codeSet };
}

/**
 * Check if a line item should be excluded based on internal company codes.
 * When `exclusionLookup` is provided, also matches user-configured excluded customers.
 */
export async function shouldExcludeLineItem(
  companyCode: string,
  customerCode: string,
  reconAccountDescription?: string,
  filePath?: string,
  customerName?: string,
  exclusionLookup?: UserExclusionLookup | null
): Promise<boolean> {
  if (reconAccountDescription) {
    const desc = reconAccountDescription.toLowerCase();
    for (const indicator of INTER_UNIT_INDICATORS) {
      if (desc.includes(indicator)) {
        return true;
      }
    }
  }
  
  const internalCodes = await getInternalCompanyCodes(filePath);
  
  if (companyCode && internalCodes.has(companyCode.toString().trim())) {
    return true;
  }
  
  if (customerCode && internalCodes.has(customerCode.toString().trim())) {
    return true;
  }
  
  // Exclude if customer code equals company code (inter-unit transfer)
  if (companyCode && customerCode && companyCode.toString().trim() === customerCode.toString().trim()) {
    return true;
  }

  if (exclusionLookup) {
    const cn = customerName?.toLowerCase().trim();
    const cc = customerCode?.toString().trim().toLowerCase();
    if (cn && exclusionLookup.nameSet.has(cn)) return true;
    if (cc && exclusionLookup.codeSet.has(cc)) return true;
  }

  return false;
}

/**
 * Same rules as `shouldExcludeLineItem`, but uses a pre-fetched `internalCodes` set (no I/O).
 * For bulk import, call `getInternalCompanyCodes()` once and pass the result.
 */
export function shouldExcludeLineItemSync(
  companyCode: string,
  customerCode: string,
  reconAccountDescription: string | undefined,
  customerName: string | undefined,
  internalCodes: Set<string>,
  exclusionLookup: UserExclusionLookup,
): boolean {
  if (reconAccountDescription) {
    const desc = reconAccountDescription.toLowerCase();
    for (const indicator of INTER_UNIT_INDICATORS) {
      if (desc.includes(indicator)) {
        return true;
      }
    }
  }

  if (companyCode && internalCodes.has(companyCode.toString().trim())) {
    return true;
  }

  if (customerCode && internalCodes.has(customerCode.toString().trim())) {
    return true;
  }

  if (companyCode && customerCode && companyCode.toString().trim() === customerCode.toString().trim()) {
    return true;
  }

  const cn = customerName?.toLowerCase().trim();
  const cc = customerCode?.toString().trim().toLowerCase();
  if (cn && exclusionLookup.nameSet.has(cn)) return true;
  if (cc && exclusionLookup.codeSet.has(cc)) return true;

  return false;
}

/**
 * Clear the internal company cache.
 */
export function clearExclusionCache(): void {
  cachedExclusions = null;
  cacheTimestamp = 0;
}

/**
 * Extract string value from row object with multiple possible key names.
 */
function extractStringValue(row: Record<string, unknown>, possibleKeys: string[]): string {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null) {
      return String(row[key]).trim();
    }
  }
  return '';
}

/**
 * Synchronous exclusion check using pre-loaded data (no DB / file calls).
 * Does NOT check reconAccountDescription since it is not stored on AgingLineItem.
 */
function checkExclusionSync(
  item: { companyCode: string; customerCode: string; customerName: string },
  internalCodes: Set<string>,
  exclusionLookup: UserExclusionLookup,
): boolean {
  const cc = item.companyCode?.trim() ?? '';
  const kc = item.customerCode?.trim() ?? '';

  if (cc && kc && cc === kc) return true;
  if (cc && internalCodes.has(cc)) return true;
  if (kc && internalCodes.has(kc)) return true;

  const cn = item.customerName?.toLowerCase().trim() ?? '';
  const kcLower = kc.toLowerCase();
  if (cn && exclusionLookup.nameSet.has(cn)) return true;
  if (kcLower && exclusionLookup.codeSet.has(kcLower)) return true;

  return false;
}

/**
 * Re-evaluate and update the `excluded` flag on all AgingLineItem rows for the
 * user's latest import, based on the current ExcludedCustomer list and internal
 * company codes.
 *
 * Note: `reconAccountDescription` is not stored on AgingLineItem so that check
 * is skipped. Rows that were originally excluded only for that reason may be
 * incorrectly re-included; a fresh import will correct them.
 */
export async function reapplyExclusionsForLatestImport(userId: string): Promise<{ updated: number }> {
  const latestImport = await prisma.agingImport.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!latestImport) return { updated: 0 };

  const [exclusionLookup, internalCodes] = await Promise.all([
    getUserExclusionLookup(userId),
    getInternalCompanyCodes(),
  ]);

  const lineItems = await prisma.agingLineItem.findMany({
    where: { importId: latestImport.id, userId },
    select: { id: true, companyCode: true, customerCode: true, customerName: true, excluded: true },
  });

  const toExclude: string[] = [];
  const toInclude: string[] = [];

  for (const item of lineItems) {
    const shouldExclude = checkExclusionSync(item, internalCodes, exclusionLookup);
    if (shouldExclude && !item.excluded) toExclude.push(item.id);
    else if (!shouldExclude && item.excluded) toInclude.push(item.id);
  }

  let updated = 0;
  if (toExclude.length > 0) {
    await prisma.agingLineItem.updateMany({ where: { id: { in: toExclude } }, data: { excluded: true } });
    updated += toExclude.length;
  }
  if (toInclude.length > 0) {
    await prisma.agingLineItem.updateMany({ where: { id: { in: toInclude } }, data: { excluded: false } });
    updated += toInclude.length;
  }

  return { updated };
}

/**
 * Preload exclusion list on server start.
 */
export async function preloadExclusions(filePath?: string): Promise<void> {
  await getInternalCompanyCodes(filePath);
  console.log('[AgingExclusions] Preloaded internal company codes');
}
