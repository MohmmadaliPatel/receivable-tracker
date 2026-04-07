import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// POST /api/confirmations/upload — bulk upload from CSV/XLSX
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const mode = (formData.get('mode') as string) || 'append'; // 'append' | 'replace'

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name.toLowerCase();

  let rows: Record<string, string>[] = [];

  try {
    if (filename.endsWith('.csv')) {
      // Parse CSV manually
      const text = buffer.toString('utf-8');
      rows = parseCSV(text);
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      // Parse XLSX using xlsx library
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      rows = jsonRows.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))
      );
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use .csv or .xlsx' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: `Failed to parse file: ${error.message}` }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 });
  }

  // Map columns (flexible header matching)
  const mapped = rows.map((row) => mapRow(row)).filter((r) => r !== null) as MappedRow[];

  if (mapped.length === 0) {
    return NextResponse.json(
      { error: 'No valid rows found. Ensure headers include: Entity Name, Category, Email TO' },
      { status: 400 }
    );
  }

  if (mode === 'replace') {
    await prisma.confirmationRecord.deleteMany({ where: { userId: user.userId } });
  }

  const created = await prisma.confirmationRecord.createMany({
    data: mapped.map((r) => ({ ...r, userId: user.userId })),
  });

  return NextResponse.json({
    success: true,
    imported: created.count,
    total: rows.length,
    skipped: rows.length - mapped.length,
  });
}

interface MappedRow {
  entityName: string;
  category: string;
  bankName?: string;
  accountNumber?: string;
  custId?: string;
  emailTo: string;
  emailCc?: string;
}

function mapRow(row: Record<string, string>): MappedRow | null {
  // Flexible column name matching (case-insensitive, partial match)
  const get = (keys: string[]): string => {
    for (const key of keys) {
      for (const [k, v] of Object.entries(row)) {
        if (k.toLowerCase().includes(key.toLowerCase()) && v) return v.trim();
      }
    }
    return '';
  };

  const entityName = get(['entity name', 'entity', 'entities name', 'entities']);
  const category = get(['category']);
  const emailTo = get(['email to', 'email ids for rolling out', 'email (to)', 'email_to', 'emailto']);

  if (!entityName || !category || !emailTo) return null;

  return {
    entityName,
    category,
    bankName: get(['bank name', 'confirming party', 'bank / confirming', 'bank/confirming']) || undefined,
    accountNumber: get(['account number', 'loan account', 'bank / loan', 'account no']) || undefined,
    custId: get(['cust id', 'customer id', 'cust_id']) || undefined,
    emailTo,
    emailCc: get(['email cc', 'email (cc)', 'email_cc', 'emailcc', 'cc']) || undefined,
  };
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
  });
}
