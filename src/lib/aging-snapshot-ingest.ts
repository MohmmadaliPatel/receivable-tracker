import * as fs from 'fs/promises';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { prisma } from './prisma';
import {
  importAgingData,
  parseAgingExcel,
  type ParsedAgingRow,
} from './aging-service';
import { computeAndPersistSnapshotMetrics } from './aging-snapshot-metrics';

function parseNum(amountStr: string | null | undefined): number {
  if (!amountStr) return 0;
  const cleaned = String(amountStr).replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 800000) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function tryParseDateCell(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number') {
    return excelSerialToDate(v);
  }
  const s = String(v).trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/,/g, ''));
  if (!isNaN(n) && n > 20000 && n < 800000) {
    const d = excelSerialToDate(n);
    if (d) return d;
  }
  const parts = s.split('.');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const d = new Date(year, month, day);
      if (d.getMonth() === month) return d;
    }
  }
  const slash = s.split('/');
  if (slash.length === 3) {
    const a = parseInt(slash[0], 10);
    const b = parseInt(slash[1], 10) - 1;
    const c = parseInt(slash[2], 10);
    if (c < 100) return null;
    const d = new Date(c, b, a);
    if (!isNaN(d.getTime())) return d;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t);
  return null;
}

/**
 * Look at first ~10 rows, column A, for a plausible snapshot date.
 */
export function peekSnapshotDateFromBuffer(buffer: Buffer): Date | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return null;
    const raw = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      const row = raw[i];
      if (!row || !row.length) continue;
      const a = tryParseDateCell(row[0]);
      if (a) return a;
    }
  } catch {
    return null;
  }
  return null;
}

function aggregateBucketsJson(rows: ParsedAgingRow[]): string {
  const acc: Record<string, number> = {
    'Not due': 0,
    '0 - 30 days': 0,
    '31 - 90 days': 0,
    '91 - 180 days': 0,
    '181 - 365 days': 0,
    '366 - 730 days': 0,
    '731 - 1095 days': 0,
    '1096 - 1460 days': 0,
    '1461 - 1845 days': 0,
    'Above 1845 days': 0,
  };
  for (const r of rows) {
    acc['Not due'] += parseNum(r.notDue);
    acc['0 - 30 days'] += parseNum(r.bucket0to30);
    acc['31 - 90 days'] += parseNum(r.bucket31to90);
    acc['91 - 180 days'] += parseNum(r.bucket91to180);
    acc['181 - 365 days'] += parseNum(r.bucket181to365);
    acc['366 - 730 days'] += parseNum(r.bucket366to730);
    acc['731 - 1095 days'] += parseNum(r.bucket731to1095);
    acc['1096 - 1460 days'] += parseNum(r.bucket1096to1460);
    acc['1461 - 1845 days'] += parseNum(r.bucket1461to1845);
    acc['Above 1845 days'] += parseNum(r.bucketAbove1845);
  }
  return JSON.stringify(acc);
}

function fallbackSnapshotDate(rows: ParsedAgingRow[]): Date | null {
  let best: Date | null = null;
  for (const r of rows) {
    if (r.docDate) {
      if (!best || r.docDate > best) best = r.docDate;
    }
  }
  return best;
}

export function sanitizeSnapshotFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const trimmed = base.replace(/^\.+/, '').slice(0, 180);
  if (!trimmed || trimmed === '.' || trimmed === '..') return 'snapshot.xlsx';
  if (trimmed.includes('..')) return 'snapshot.xlsx';
  return trimmed;
}

export type IngestAgingSnapshotInput = {
  buffer: Buffer;
  originalName: string;
  userId: string;
  uploadsDir?: string;
};

export type IngestAgingSnapshotResult = {
  snapshotId: string;
  rowCount: number;
  customerCount: number;
  pruned: number;
  excludedCount: number;
  chaseCount: number;
  fileName: string;
  sourceFilePath: string;
};

/**
 * Ingest an ageing snapshot: write file, import rows, set metadata, enforce retention.
 */
export async function ingestAgingSnapshot(
  input: IngestAgingSnapshotInput
): Promise<IngestAgingSnapshotResult> {
  const { buffer, originalName, userId } = input;
  const uploadsDir =
    input.uploadsDir ||
    path.join(process.cwd(), 'uploads', 'snapshots');

  const rows = parseAgingExcel(buffer);
  if (rows.length === 0) {
    throw new Error(
      'No valid data found in the Excel file. Please check the file format.'
    );
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const safe = sanitizeSnapshotFileName(originalName);
  const fileKey = `${Date.now()}_${safe}`;
  const absPath = path.join(uploadsDir, fileKey);
  const relPath = path.join('uploads', 'snapshots', fileKey);

  await fs.writeFile(absPath, buffer);

  let result;
  try {
    result = await importAgingData(userId, originalName, rows);
  } catch (e) {
    await fs.unlink(absPath).catch(() => {});
    throw e;
  }

  const importId = result.importId;
  const peeked = peekSnapshotDateFromBuffer(buffer);
  const fallback = fallbackSnapshotDate(rows);
  const snapshotDate = peeked ?? fallback ?? new Date();
  const bucketsJson = aggregateBucketsJson(rows);

  const customerGroups = await prisma.agingLineItem.groupBy({
    by: ['customerCode', 'customerName'],
    where: { importId, userId, excluded: false },
  });
  const customerCount = customerGroups.length;

  await prisma.agingImport.update({
    where: { id: importId },
    data: {
      sourceFilePath: relPath,
      snapshotDate,
      bucketsJson,
      customerCount,
      storedRowCount: rows.length,
    },
  });

  await computeAndPersistSnapshotMetrics(userId, importId);

  let appSettings = await prisma.appSettings.findUnique({
    where: { userId },
  });
  if (!appSettings) {
    appSettings = await prisma.appSettings.create({
      data: { userId },
    });
  }
  const retention = Math.max(1, appSettings.snapshotRetentionCount ?? 12);

  const allForUser = await prisma.agingImport.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, sourceFilePath: true },
  });

  let pruned = 0;
  if (allForUser.length > retention) {
    const toRemove = allForUser.slice(retention);
    for (const old of toRemove) {
      if (old.sourceFilePath) {
        const full = path.join(process.cwd(), old.sourceFilePath);
        await fs.unlink(full).catch(() => {});
      }
      await prisma.agingImport.delete({
        where: { id: old.id },
      });
      pruned++;
    }
  }

  return {
    snapshotId: importId,
    rowCount: result.lineCount,
    customerCount,
    pruned,
    excludedCount: result.excludedCount,
    chaseCount: result.chaseCount,
    fileName: result.fileName,
    sourceFilePath: relPath,
  };
}
