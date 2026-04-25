import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';

/**
 * Customer email directory service for managing customer email mappings.
 * Supports CSV export/import and name-based vs code-based mapping preferences.
 */

export interface CustomerEmailEntry {
  id: string;
  keyType: 'customer_name' | 'customer_code';
  keyValue: string;
  companyName: string | null;
  emailTo: string;
  emailCc: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerEmailInput {
  keyType: 'customer_name' | 'customer_code';
  keyValue: string;
  companyName?: string;
  emailTo: string;
  emailCc?: string;
}

/**
 * Get all customer email entries for a user.
 */
export async function getCustomerEmails(
  userId: string,
  options?: {
    keyType?: 'customer_name' | 'customer_code';
    search?: string;
  }
): Promise<CustomerEmailEntry[]> {
  const where: any = { userId };
  
  if (options?.keyType) {
    where.keyType = options.keyType;
  }
  
  if (options?.search) {
    where.OR = [
      { keyValue: { contains: options.search, mode: 'insensitive' } },
      { emailTo: { contains: options.search, mode: 'insensitive' } },
      { companyName: { contains: options.search, mode: 'insensitive' } },
    ];
  }
  
  const entries = await prisma.customerEmailEntry.findMany({
    where,
    orderBy: [{ keyType: 'asc' }, { keyValue: 'asc' }],
  });
  
  return entries.map((e) => mapEmailRow(e));
}

function mapEmailRow(e: {
  id: string;
  keyType: string;
  keyValue: string;
  companyName: string | null;
  emailTo: string;
  emailCc: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CustomerEmailEntry {
  return {
    id: e.id,
    keyType: e.keyType as 'customer_name' | 'customer_code',
    keyValue: e.keyValue,
    companyName: e.companyName,
    emailTo: e.emailTo,
    emailCc: e.emailCc,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

const LIST_SORT = ['keyValue', 'companyName', 'emailTo', 'emailCc', 'keyType', 'updatedAt'] as const;
export type CustomerEmailSortField = (typeof LIST_SORT)[number];

export type ListCustomerEmailsOptions = {
  /** If set, restrict to these; empty = all key types */
  keyTypes?: ('customer_name' | 'customer_code')[];
  search?: string;
  companyNames?: string[];
  keyValues?: string[];
  emailTos?: string[];
  emailCcs?: string[];
  page: number;
  pageSize: number;
  sortBy: CustomerEmailSortField;
  sortOrder: 'asc' | 'desc';
};

const FILTER_FACET_CAP = 500;

async function customerEmailFilterOptions(
  userId: string,
  keyTypes: ('customer_name' | 'customer_code')[] | undefined
): Promise<{
  keyType: string[];
  keyValue: string[];
  companyName: string[];
  emailTo: string[];
  emailCc: string[];
}> {
  const base: Prisma.CustomerEmailEntryWhereInput = {
    userId,
    ...(keyTypes && keyTypes.length > 0 ? { keyType: { in: keyTypes } } : {}),
  };

  const [keyRows, compRows, toRows, ccRows] = await Promise.all([
    prisma.customerEmailEntry.findMany({
      where: base,
      select: { keyValue: true },
      distinct: ['keyValue'],
      take: FILTER_FACET_CAP,
      orderBy: { keyValue: 'asc' },
    }),
    prisma.customerEmailEntry.findMany({
      where: {
        ...base,
        AND: [{ companyName: { not: null } }, { companyName: { not: '' } }],
      },
      select: { companyName: true },
      distinct: ['companyName'],
      take: FILTER_FACET_CAP,
      orderBy: { companyName: 'asc' },
    }),
    prisma.customerEmailEntry.findMany({
      where: base,
      select: { emailTo: true },
      distinct: ['emailTo'],
      take: FILTER_FACET_CAP,
      orderBy: { emailTo: 'asc' },
    }),
    prisma.customerEmailEntry.findMany({
      where: {
        ...base,
        AND: [{ emailCc: { not: null } }, { emailCc: { not: '' } }],
      },
      select: { emailCc: true },
      distinct: ['emailCc'],
      take: FILTER_FACET_CAP,
      orderBy: { emailCc: 'asc' },
    }),
  ]);

  return {
    keyType: ['customer_name', 'customer_code'],
    keyValue: keyRows.map((k) => k.keyValue).filter(Boolean),
    companyName: compRows
      .map((c) => c.companyName)
      .filter((n): n is string => n != null && n.trim() !== ''),
    emailTo: toRows.map((e) => e.emailTo).filter(Boolean),
    emailCc: ccRows.map((c) => c.emailCc).filter((s): s is string => s != null && s.trim() !== ''),
  };
}

/**
 * Paginated, sorted list with total count. SQLite-safe (no case-insensitive mode).
 */
export async function listCustomerEmailsPage(
  userId: string,
  options: ListCustomerEmailsOptions
): Promise<{
  entries: CustomerEmailEntry[];
  total: number;
  filterOptions: {
    keyType: string[];
    keyValue: string[];
    companyName: string[];
    emailTo: string[];
    emailCc: string[];
  };
}> {
  const {
    keyTypes,
    search,
    companyNames,
    keyValues,
    emailTos,
    emailCcs,
    page,
    pageSize,
    sortBy = 'keyValue',
    sortOrder = 'asc',
  } = options;
  const skip = Math.max(0, (Math.max(1, page) - 1) * pageSize);
  const take = Math.min(500, Math.max(1, pageSize));

  const where: Prisma.CustomerEmailEntryWhereInput = { userId };
  if (keyTypes && keyTypes.length > 0) {
    where.keyType = keyTypes.length === 1 ? keyTypes[0]! : { in: keyTypes };
  }
  if (search && search.trim()) {
    const t = search.trim();
    where.OR = [
      { keyValue: { contains: t } },
      { emailTo: { contains: t } },
      { companyName: { contains: t } },
    ];
  }
  if (companyNames && companyNames.length > 0) {
    where.companyName = { in: companyNames };
  }
  if (keyValues && keyValues.length > 0) {
    where.keyValue = { in: keyValues };
  }
  if (emailTos && emailTos.length > 0) {
    where.emailTo = { in: emailTos };
  }
  if (emailCcs && emailCcs.length > 0) {
    where.emailCc = { in: emailCcs };
  }

  const dir = sortOrder === 'desc' ? 'desc' : 'asc';
  const orderBy: Prisma.CustomerEmailEntryOrderByWithRelationInput = {};
  if (sortBy === 'keyValue') orderBy.keyValue = dir;
  else if (sortBy === 'companyName') orderBy.companyName = dir;
  else if (sortBy === 'emailTo') orderBy.emailTo = dir;
  else if (sortBy === 'emailCc') orderBy.emailCc = dir;
  else if (sortBy === 'keyType') orderBy.keyType = dir;
  else orderBy.updatedAt = dir;

  const [total, raw, filterOptions] = await Promise.all([
    prisma.customerEmailEntry.count({ where }),
    prisma.customerEmailEntry.findMany({
      where,
      orderBy,
      skip,
      take,
    }),
    customerEmailFilterOptions(userId, keyTypes),
  ]);

  return {
    entries: raw.map((e) => mapEmailRow(e)),
    total,
    filterOptions,
  };
}

/**
 * Get a single customer email entry.
 */
export async function getCustomerEmail(
  userId: string,
  keyType: 'customer_name' | 'customer_code',
  keyValue: string
): Promise<CustomerEmailEntry | null> {
  const entry = await prisma.customerEmailEntry.findUnique({
    where: {
      userId_keyType_keyValue: {
        userId,
        keyType,
        keyValue: keyValue.toLowerCase().trim(),
      },
    },
  });
  
  if (!entry) return null;
  
  return {
    id: entry.id,
    keyType: entry.keyType as 'customer_name' | 'customer_code',
    keyValue: entry.keyValue,
    companyName: entry.companyName,
    emailTo: entry.emailTo,
    emailCc: entry.emailCc,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Create or update a customer email entry.
 */
export async function upsertCustomerEmail(
  userId: string,
  input: CustomerEmailInput
): Promise<CustomerEmailEntry> {
  const keyValue = input.keyValue.toLowerCase().trim();
  
  const entry = await prisma.customerEmailEntry.upsert({
    where: {
      userId_keyType_keyValue: {
        userId,
        keyType: input.keyType,
        keyValue,
      },
    },
    create: {
      userId,
      keyType: input.keyType,
      keyValue,
      companyName: input.companyName || null,
      emailTo: input.emailTo.trim(),
      emailCc: input.emailCc?.trim() || null,
    },
    update: {
      emailTo: input.emailTo.trim(),
      emailCc: input.emailCc?.trim() || null,
      companyName: input.companyName || null,
    },
  });
  
  return {
    id: entry.id,
    keyType: entry.keyType as 'customer_name' | 'customer_code',
    keyValue: entry.keyValue,
    companyName: entry.companyName,
    emailTo: entry.emailTo,
    emailCc: entry.emailCc,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Update an entry by id (key can change if no conflict on userId+keyType+keyValue).
 */
export async function updateCustomerEmailById(
  userId: string,
  id: string,
  input: {
    keyValue: string;
    companyName?: string | null;
    emailTo: string;
    emailCc?: string | null;
  }
): Promise<CustomerEmailEntry> {
  const existing = await prisma.customerEmailEntry.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    throw new Error('Entry not found');
  }

  const keyValue = input.keyValue.toLowerCase().trim();
  if (!keyValue) {
    throw new Error('Customer name/code is required');
  }

  if (keyValue !== existing.keyValue) {
    const conflict = await prisma.customerEmailEntry.findFirst({
      where: {
        userId,
        keyType: existing.keyType,
        keyValue,
        id: { not: id },
      },
    });
    if (conflict) {
      throw new Error('Another entry already uses this name or code');
    }
  }

  const entry = await prisma.customerEmailEntry.update({
    where: { id },
    data: {
      keyValue,
      companyName: input.companyName?.trim() ? input.companyName.trim() : null,
      emailTo: input.emailTo.trim(),
      emailCc: input.emailCc?.trim() ? input.emailCc.trim() : null,
    },
  });

  return {
    id: entry.id,
    keyType: entry.keyType as 'customer_name' | 'customer_code',
    keyValue: entry.keyValue,
    companyName: entry.companyName,
    emailTo: entry.emailTo,
    emailCc: entry.emailCc,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Delete a customer email entry.
 */
export async function deleteCustomerEmail(
  userId: string,
  id: string
): Promise<void> {
  await prisma.customerEmailEntry.deleteMany({
    where: {
      id,
      userId,
    },
  });
}

/**
 * Get email for a customer with fallback logic.
 * If no email found for code, tries to find by name.
 */
export async function getEmailForCustomer(
  userId: string,
  customerCode: string,
  customerName: string,
  preference: 'name' | 'code' = 'name'
): Promise<{ emailTo: string; emailCc: string | null; source: string } | null> {
  // Try preferred method first
  if (preference === 'code') {
    const byCode = await getCustomerEmail(userId, 'customer_code', customerCode);
    if (byCode?.emailTo) {
      return {
        emailTo: byCode.emailTo,
        emailCc: byCode.emailCc,
        source: 'customer_code',
      };
    }
  }
  
  // Try by name
  const byName = await getCustomerEmail(userId, 'customer_name', customerName);
  if (byName?.emailTo) {
    return {
      emailTo: byName.emailTo,
      emailCc: byName.emailCc,
      source: 'customer_name',
    };
  }
  
  // Fallback: if preferred was name, try code
  if (preference === 'name') {
    const byCode = await getCustomerEmail(userId, 'customer_code', customerCode);
    if (byCode?.emailTo) {
      return {
        emailTo: byCode.emailTo,
        emailCc: byCode.emailCc,
        source: 'customer_code',
      };
    }
  }
  
  return null;
}

/**
 * In-memory index for the same resolution rules as {@link getEmailForCustomer} (avoids N queries per import line).
 */
export type CustomerEmailLookupIndex = {
  byCode: Map<string, { emailTo: string; emailCc: string | null }>;
  byName: Map<string, { emailTo: string; emailCc: string | null }>;
};

function normKey(s: string): string {
  return s.toLowerCase().trim();
}

export async function buildCustomerEmailLookupIndex(userId: string): Promise<CustomerEmailLookupIndex> {
  const entries = await prisma.customerEmailEntry.findMany({
    where: { userId },
    select: { keyType: true, keyValue: true, emailTo: true, emailCc: true },
  });
  const byCode = new Map<string, { emailTo: string; emailCc: string | null }>();
  const byName = new Map<string, { emailTo: string; emailCc: string | null }>();
  for (const e of entries) {
    if (!e.emailTo?.trim()) {
      continue;
    }
    const v = { emailTo: e.emailTo.trim(), emailCc: e.emailCc };
    const k = normKey(e.keyValue);
    if (e.keyType === 'customer_code') {
      byCode.set(k, v);
    } else {
      byName.set(k, v);
    }
  }
  return { byCode, byName };
}

/**
 * Match {@link getEmailForCustomer} using a preloaded index.
 */
export function getEmailForCustomerFromIndex(
  index: CustomerEmailLookupIndex,
  customerCode: string,
  customerName: string,
  preference: 'name' | 'code' = 'name',
): { emailTo: string; emailCc: string | null; source: string } | null {
  if (preference === 'code') {
    const byCode = index.byCode.get(normKey(customerCode));
    if (byCode?.emailTo) {
      return { emailTo: byCode.emailTo, emailCc: byCode.emailCc, source: 'customer_code' };
    }
  }
  const byName = index.byName.get(normKey(customerName));
  if (byName?.emailTo) {
    return { emailTo: byName.emailTo, emailCc: byName.emailCc, source: 'customer_name' };
  }
  if (preference === 'name') {
    const byCode2 = index.byCode.get(normKey(customerCode));
    if (byCode2?.emailTo) {
      return { emailTo: byCode2.emailTo, emailCc: byCode2.emailCc, source: 'customer_code' };
    }
  }
  return null;
}

/**
 * True when a send would have a To address: directory (same rules as bulk send) or sheet fallback.
 */
export function hasResolvableRecipientForAgingLine(
  index: CustomerEmailLookupIndex,
  line: { emailTo: string | null; customerCode: string; customerName: string },
  preference: 'name' | 'code' = 'name',
): boolean {
  const dir = getEmailForCustomerFromIndex(index, line.customerCode, line.customerName, preference);
  const directoryTo = dir?.emailTo?.trim();
  const sheetTo = (line.emailTo || '').trim();
  return Boolean(directoryTo || sheetTo);
}

/**
 * Build full CSV export for a key type. Name view: one key column. Code view: name + code (name from ageing data when available).
 */
export async function buildCustomerEmailsExport(
  userId: string,
  keyType: 'customer_name' | 'customer_code'
): Promise<string> {
  const entries = await getCustomerEmails(userId, { keyType });

  if (keyType === 'customer_name') {
    let csv = 'Customer Name,Customer name,Email To,Email Cc\n';
    for (const entry of entries) {
      const name = escapeCsvValue(entry.keyValue);
      const company = escapeCsvValue(entry.companyName || '');
      const emailTo = escapeCsvValue(entry.emailTo);
      const emailCc = escapeCsvValue(entry.emailCc || '');
      csv += `${name},${company},${emailTo},${emailCc}\n`;
    }
    return csv;
  }

  const codes = [...new Set(entries.map((e) => e.keyValue))];
  const nameByCode = new Map<string, string>();
  if (codes.length > 0) {
    const items = await prisma.agingLineItem.findMany({
      where: { userId, excluded: false, customerCode: { in: codes } },
      select: { customerCode: true, customerName: true },
    });
    for (const it of items) {
      if (!nameByCode.has(it.customerCode) && it.customerName) {
        nameByCode.set(it.customerCode, it.customerName);
      }
    }
  }

  let csv = 'Customer Name,Customer Code,Customer name,Email To,Email Cc\n';
  for (const entry of entries) {
    const displayName = nameByCode.get(entry.keyValue) || '';
    const name = escapeCsvValue(displayName);
    const code = escapeCsvValue(entry.keyValue);
    const company = escapeCsvValue(entry.companyName || '');
    const emailTo = escapeCsvValue(entry.emailTo);
    const emailCc = escapeCsvValue(entry.emailCc || '');
    csv += `${name},${code},${company},${emailTo},${emailCc}\n`;
  }
  return csv;
}

/**
 * Parse CSV content and create/update customer email entries.
 * Returns counts of created, updated, and errors.
 */
export async function importCustomerEmailsFromCsv(
  userId: string,
  csvContent: string,
  keyType: 'customer_name' | 'customer_code'
): Promise<{
  created: number;
  updated: number;
  errors: number;
  errorDetails: string[];
}> {
  const lines = csvContent.split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    return { created: 0, updated: 0, errors: 1, errorDetails: ['CSV has no data rows'] };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const findKeyColumn = () => {
    if (keyType === 'customer_code') {
      const exact = ['customer code', 'code', 'key'] as const;
      for (const e of exact) {
        const i = header.findIndex((h) => h === e);
        if (i >= 0) return i;
      }
      return header.findIndex((h) => h.includes('code') && !h.includes('name'));
    }
    const exact = ['customer name', 'name', 'key'] as const;
    for (const e of exact) {
      const i = header.findIndex((h) => h === e);
      if (i >= 0) return i;
    }
    return header.findIndex(
      (h) => (h.includes('name') && !h.includes('code')) || h === 'key'
    );
  };

  const keyIndex = findKeyColumn();
  const companyIndex = (() => {
    const byCompany = header.findIndex((h) => h.includes('company'));
    if (byCompany >= 0) return byCompany;
    if (keyType === 'customer_name' && keyIndex >= 0) {
      const secondName = header.findIndex((h, idx) => h === 'customer name' && idx !== keyIndex);
      if (secondName >= 0) return secondName;
    }
    return -1;
  })();
  const emailToIndex = header.findIndex(
    (h) => h === 'email to' || h.includes('emailto') || (h.includes('email') && !h.includes('cc'))
  );
  const emailCcIndex = header.findIndex(
    (h) => h === 'email cc' || h.includes('emailcc') || (h.includes('cc') && h !== 'customer code')
  );

  if (keyIndex === -1 || emailToIndex === -1) {
    return {
      created: 0,
      updated: 0,
      errors: 1,
      errorDetails: [
        keyType === 'customer_code'
          ? 'CSV must include "Customer Code" (or "Code" / "Key") and "Email To" columns'
          : 'CSV must include "Customer Name" (or "Name" / "Key") and "Email To" columns',
      ],
    };
  }
  
  let created = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: string[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCsvLine(lines[i]);
      
      const keyValue = values[keyIndex]?.trim();
      const emailTo = values[emailToIndex]?.trim();
      
      if (!keyValue || !emailTo) {
        continue; // Skip empty rows
      }
      
      // Validate email format
      if (!isValidEmail(emailTo)) {
        errors++;
        errorDetails.push(`Row ${i + 1}: Invalid email format "${emailTo}"`);
        continue;
      }
      
      const companyName = companyIndex >= 0 ? values[companyIndex]?.trim() : undefined;
      const emailCc = emailCcIndex >= 0 ? values[emailCcIndex]?.trim() : undefined;
      
      // Check if exists
      const existing = await getCustomerEmail(userId, keyType, keyValue);
      
      await upsertCustomerEmail(userId, {
        keyType,
        keyValue,
        companyName,
        emailTo,
        emailCc,
      });
      
      if (existing) {
        updated++;
      } else {
        created++;
      }
    } catch (error) {
      errors++;
      errorDetails.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  return { created, updated, errors, errorDetails };
}

/**
 * Sync customer emails from line items.
 * Creates entries for customers found in imports that don't have emails yet.
 */
export async function syncCustomerEmailsFromImports(
  userId: string
): Promise<{ added: number }> {
  // Get distinct customers from line items
  const lineItems = await prisma.agingLineItem.findMany({
    where: { userId, excluded: false },
    select: {
      customerName: true,
      customerCode: true,
      companyName: true,
      emailTo: true,
      emailCc: true,
    },
    distinct: ['customerName', 'customerCode'],
  });
  
  let added = 0;
  
  for (const item of lineItems) {
    if (!item.emailTo) continue;
    
    // Check if we already have an entry for this customer name
    const existingName = await getCustomerEmail(userId, 'customer_name', item.customerName);
    
    if (!existingName) {
      await upsertCustomerEmail(userId, {
        keyType: 'customer_name',
        keyValue: item.customerName,
        companyName: item.companyName,
        emailTo: item.emailTo,
        emailCc: item.emailCc || undefined,
      });
      added++;
    }
    
    // Also add by code if different
    if (item.customerCode !== item.customerName) {
      const existingCode = await getCustomerEmail(userId, 'customer_code', item.customerCode);
      
      if (!existingCode) {
        await upsertCustomerEmail(userId, {
          keyType: 'customer_code',
          keyValue: item.customerCode,
          companyName: item.companyName,
          emailTo: item.emailTo,
          emailCc: item.emailCc || undefined,
        });
        added++;
      }
    }
  }
  
  return { added };
}

/**
 * Helper: Escape CSV value.
 */
function escapeCsvValue(value: string): string {
  if (!value) return '';
  
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  
  return value;
}

/**
 * Helper: Parse a CSV line handling quoted values.
 */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current);
  return values;
}

/**
 * Helper: Validate email format.
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
