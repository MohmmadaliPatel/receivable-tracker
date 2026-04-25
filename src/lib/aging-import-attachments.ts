import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const AGING_IMPORT_ATTACH_BASE = 'uploads/aging-attachments' as const;

const INVALID_PATH_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/** Parse totalBalance from ageing line (strip commas, NaN -> 0). */
export function parseLineTotalBalance(s: string | null | undefined): number {
  if (s == null || s === '') return 0;
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

export function sanitizePathSegment(s: string, maxLen: number): string {
  const t = s.replace(INVALID_PATH_CHARS, '_').trim();
  return (t || 'x').slice(0, maxLen);
}

/**
 * One shared convention for template ZIP and upload parsing: `Name (code)`.
 * Used as the folder name in the template.
 */
export function buildTemplateFolderName(customerName: string, customerCode: string): string {
  const name = sanitizePathSegment(customerName || 'Customer', 200);
  const code = sanitizePathSegment((customerCode || '').trim() || 'code', 80);
  return `${name} (${code})`;
}

/** Extract `code` from suffix `... (CODE)`; code can contain spaces. */
export function extractCodeFromTemplateFolderName(folderName: string): string | null {
  const t = folderName.trim();
  const m = t.match(/\(([^)]+)\)\s*$/);
  if (!m) return null;
  return m[1].trim() || null;
}

export type TemplateCustomerRow = {
  customerCode: string;
  customerName: string;
  folderName: string;
  /** Sum of totalBalance for this customer's line items. */
  balanceSum: number;
};

/**
 * Customers with aggregate balance > 0, optional company name filter, excluded lines omitted.
 */
export async function listTemplateCustomersForImport(
  userId: string,
  importId: string,
  companyNames: string[] | null
): Promise<TemplateCustomerRow[]> {
  const where: Prisma.AgingLineItemWhereInput = {
    userId,
    importId,
    excluded: false,
  };
  if (companyNames && companyNames.length > 0) {
    const set = new Set(companyNames.map((s) => s.trim()).filter(Boolean));
    if (set.size > 0) {
      where.companyName = { in: [...set] };
    }
  }

  const rows = await prisma.agingLineItem.findMany({
    where,
    select: {
      customerCode: true,
      customerName: true,
      totalBalance: true,
    },
  });

  const byCode = new Map<string, { sum: number; name: string }>();
  for (const r of rows) {
    const code = (r.customerCode || '').trim();
    if (!code) continue;
    const add = parseLineTotalBalance(r.totalBalance);
    const cur = byCode.get(code);
    if (!cur) {
      byCode.set(code, { sum: add, name: (r.customerName || '').trim() || code });
    } else {
      cur.sum += add;
      if (!cur.name && (r.customerName || '').trim()) {
        cur.name = (r.customerName || '').trim();
      }
    }
  }

  const out: TemplateCustomerRow[] = [];
  for (const [customerCode, { sum, name }] of byCode) {
    if (sum <= 0) continue;
    const customerName = name || customerCode;
    out.push({
      customerCode,
      customerName,
      folderName: buildTemplateFolderName(customerName, customerCode),
      balanceSum: sum,
    });
  }
  out.sort((a, b) => a.customerName.localeCompare(b.customerName) || a.customerCode.localeCompare(b.customerCode));
  return out;
}

export function getContentTypeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    txt: 'text/plain',
  };
  return types[ext || ''] || 'application/octet-stream';
}

export type ResolvedMailAttachment = { name: string; contentBytes: string; contentType: string };

/** Prefer import-scoped file, else legacy rules (caller passes rules and reads files). */
export async function readImportScopeAttachment(
  filePath: string,
  fileName: string
): Promise<ResolvedMailAttachment | null> {
  try {
    const abs = join(process.cwd(), filePath);
    const fileContent = await readFile(abs);
    return {
      name: fileName,
      contentBytes: fileContent.toString('base64'),
      contentType: getContentTypeForFilename(fileName),
    };
  } catch (e) {
    console.warn('[Aging import attachment] read failed', filePath, e);
    return null;
  }
}

type FirstItem = { customerCode: string; customerName: string; companyName: string };

/**
 * Import-scoped file wins (single). Otherwise legacy `AgingAttachmentRule` (multiple allowed).
 */
export async function collectAgingSendAttachments(
  userId: string,
  firstItem: FirstItem,
  importMap: Map<string, { filePath: string; fileName: string }>
): Promise<ResolvedMailAttachment[]> {
  const code = (firstItem.customerCode || '').trim();
  const scoped = importMap.get(code);
  if (scoped) {
    const a = await readImportScopeAttachment(scoped.filePath, scoped.fileName);
    if (a) return [a];
  }
  const attachmentRules = await prisma.agingAttachmentRule.findMany({
    where: {
      userId,
      OR: [
        { matchType: 'customer_code', matchValue: firstItem.customerCode },
        { matchType: 'customer_name', matchValue: firstItem.customerName },
        { matchType: 'company_name', matchValue: firstItem.companyName },
      ],
    },
  });
  const out: ResolvedMailAttachment[] = [];
  for (const rule of attachmentRules) {
    try {
      const abs = join(process.cwd(), rule.filePath);
      const fileContent = await readFile(abs);
      out.push({
        name: rule.fileName,
        contentBytes: fileContent.toString('base64'),
        contentType: getContentTypeForFilename(rule.fileName),
      });
    } catch (e) {
      console.warn('[Aging send] could not read rule attachment', rule.filePath, e);
    }
  }
  return out;
}

type LineWithDoc = { documentNo: string | null | undefined };

/**
 * Merges server-side attachments (import + rules) with per–document PDFs from a local folder upload.
 * Local PDFs are matched by `documentNo`; if a file uses the same `name` as a server attachment, the local one wins.
 */
export function mergeAgingSendAttachmentsWithLocalPdfs(
  base: ResolvedMailAttachment[],
  lineItems: LineWithDoc[],
  localByDocNo: Map<string, ResolvedMailAttachment>
): ResolvedMailAttachment[] {
  const byName = new Map<string, ResolvedMailAttachment>();
  for (const a of base) {
    byName.set(a.name.toLowerCase(), a);
  }
  for (const li of lineItems) {
    const dn = (li.documentNo == null ? '' : String(li.documentNo)).trim();
    if (!dn) continue;
    const local = localByDocNo.get(dn);
    if (local) {
      byName.set(local.name.toLowerCase(), local);
    }
  }
  return Array.from(byName.values());
}
