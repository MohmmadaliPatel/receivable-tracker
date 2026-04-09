import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/simple-auth';

async function getAuthUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  return await getSession(token);
}

function fmtDt(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function stripHtml(raw: string): string {
  let s = raw.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return s.replace(/\s+/g, ' ').trim();
}

// GET /api/reports  →  all confirmation records with full detail for the logged-in user
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const format = req.nextUrl.searchParams.get('format');

  const records = await prisma.confirmationRecord.findMany({
    where: {},
    orderBy: [{ entityName: 'asc' }, { category: 'asc' }, { createdAt: 'asc' }],
  });

  if (format === 'csv') {
    const cols = [
      'Entity Name', 'Category', 'Bank/Party', 'Account Number', 'Customer ID',
      'Email To', 'Email CC', 'Remarks', 'Status',
      'Sent At', 'Follow-up Count', 'Last Follow-up At',
      'Response Received At', 'Response From Name', 'Response From Email',
      'Response', 'Has Attachments',
      'Created At',
    ];

    function esc(v: unknown): string {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }

    const rows = records.map((r) => {
      const responseText = r.responseBody
        ? stripHtml(r.responseBody)
        : r.responseHtmlBody
          ? stripHtml(r.responseHtmlBody)
          : '';
      return [
        r.entityName, r.category, r.bankName ?? '', r.accountNumber ?? '', r.custId ?? '',
        r.emailTo, r.emailCc ?? '', r.remarks ?? '', r.status,
        fmtDt(r.sentAt),
        r.followupCount,
        fmtDt(r.followupSentAt),
        fmtDt(r.responseReceivedAt),
        r.responseFromName ?? '', r.responseFromEmail ?? '',
        responseText.slice(0, 500),
        r.responseHasAttachments ? 'Yes' : 'No',
        fmtDt(r.createdAt),
      ].map(esc).join(',');
    });

    const csv = [cols.map(esc).join(','), ...rows].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bulk-email-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const jsonRecords = records.map((r) => ({
    ...r,
    responseBody: r.responseBody ?? null,
    responseHtmlBody: r.responseHtmlBody ?? null,
  }));

  return NextResponse.json({ records: jsonRecords });
}
