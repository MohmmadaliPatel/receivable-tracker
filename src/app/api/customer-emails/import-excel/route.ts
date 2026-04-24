import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/simple-auth';
import { upsertCustomerEmail } from '@/lib/customer-email-directory';
import { parseEmailAddresses, joinEmails } from '@/lib/email-parser';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string' || !('arrayBuffer' in file)) {
      return NextResponse.json({ error: 'Missing Excel file' }, { status: 400 });
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Find the right sheet — prefer "Sheet1", fall back to second sheet, then first
    let sheetName = 'Sheet1';
    if (!workbook.SheetNames.includes(sheetName)) {
      sheetName = workbook.SheetNames.length > 1
        ? workbook.SheetNames[1]
        : workbook.SheetNames[0];
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return NextResponse.json({ error: 'No valid sheet found in the Excel file' }, { status: 400 });
    }

    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in the sheet' }, { status: 400 });
    }

    // Find the right column names (flexible matching)
    const headers = Object.keys(rows[0]);

    const findHeader = (patterns: string[]): string | null => {
      // Pass 1: exact match (case-insensitive)
      for (const p of patterns) {
        const found = headers.find((h) => h.toLowerCase().trim() === p.toLowerCase().trim());
        if (found) return found;
      }
      // Pass 2: partial match — only for patterns longer than 3 chars to avoid
      // 'TO' matching 'Customer' or 'CC' matching random columns
      for (const p of patterns) {
        if (p.length <= 3) continue;
        const found = headers.find((h) => h.toLowerCase().includes(p.toLowerCase()));
        if (found) return found;
      }
      return null;
    };

    const customerCodeCol = findHeader(['Customer Code in SAP', 'Customer Code', 'Code']);
    const toCol = findHeader(['TO', 'Email To']);
    const ccCol = findHeader(['CC', 'Email CC', 'cc List']);
    const projectCol = findHeader(['Project Name', 'Project']);

    if (!customerCodeCol) {
      return NextResponse.json(
        { error: `Could not find a "Customer Code" column. Available columns: ${headers.join(', ')}` },
        { status: 400 }
      );
    }

    if (!toCol) {
      return NextResponse.json(
        { error: `Could not find a "TO" email column. Available columns: ${headers.join(', ')}` },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    const skippedDetails: { row: number; code: string; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const rawCode = row[customerCodeCol];
        if (rawCode == null || String(rawCode).trim() === '') {
          skipped++;
          skippedDetails.push({ row: i + 2, code: '—', reason: 'No customer code' });
          continue;
        }

        const customerCode = String(rawCode).trim();
        const rawTo = row[toCol] != null ? String(row[toCol]) : '';
        const rawCc = ccCol && row[ccCol] != null ? String(row[ccCol]) : '';

        const toEmails = parseEmailAddresses(rawTo);
        const ccEmails = parseEmailAddresses(rawCc);

        if (toEmails.length === 0) {
          skipped++;
          const projectName = projectCol && row[projectCol] ? String(row[projectCol]).trim() : '';
          skippedDetails.push({
            row: i + 2,
            code: customerCode,
            reason: rawTo ? 'No valid email found in TO field' : 'TO field is empty',
          });
          continue;
        }

        const emailTo = joinEmails(toEmails);
        const emailCc = ccEmails.length > 0 ? joinEmails(ccEmails) : undefined;
        const companyName = projectCol && row[projectCol] ? String(row[projectCol]).trim() : undefined;

        // Check if entry already exists
        const { prisma } = await import('@/lib/prisma');
        const existing = await prisma.customerEmailEntry.findUnique({
          where: {
            userId_keyType_keyValue: {
              userId: user.id,
              keyType: 'customer_code',
              keyValue: customerCode.toLowerCase().trim(),
            },
          },
        });

        await upsertCustomerEmail(user.id, {
          keyType: 'customer_code',
          keyValue: customerCode,
          companyName,
          emailTo,
          emailCc,
        });

        if (existing) {
          updated++;
        } else {
          created++;
        }
      } catch (err) {
        errors++;
        errorDetails.push(
          `Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      skipped,
      errors,
      errorDetails: errorDetails.slice(0, 20),
      skippedDetails,
      totalRows: rows.length,
    });
  } catch (error) {
    console.error('[Customer Emails] Excel import error:', error);
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
