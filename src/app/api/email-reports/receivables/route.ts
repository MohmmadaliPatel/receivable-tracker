import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/simple-auth';
import {
  getReceivablesEmailReport,
  getReceivablesEmailReportAllRows,
  receivablesReportToCsv,
} from '@/lib/email-report-receivables';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');

  try {
    if (format === 'csv') {
      const allRows = await getReceivablesEmailReportAllRows(user.id, searchParams);
      const csv = receivablesReportToCsv(allRows);
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="receivables-email-report-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const data = await getReceivablesEmailReport(user.id, searchParams);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
