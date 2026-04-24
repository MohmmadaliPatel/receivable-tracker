import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';

/** Matches cleanmax, "clean max", or cmes (case-insensitive). */
const NAME_PATTERN = /clean\s*max|cmes/i;

export type SuggestRow = {
  customerName: string;
  customerCode: string;
  companyName: string;
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const latest = await prisma.agingImport.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return NextResponse.json({ suggestions: [] as SuggestRow[] });
    }

    const lineItems = await prisma.agingLineItem.findMany({
      where: { userId: user.id, importId: latest.id, excluded: false },
      select: { customerName: true, customerCode: true, companyName: true },
    });

    const seen = new Set<string>();
    const suggestions: SuggestRow[] = [];

    for (const it of lineItems) {
      if (!it.customerName || !NAME_PATTERN.test(it.customerName)) continue;
      const k = `${it.customerCode}|||${it.customerName}|||${it.companyName || ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      suggestions.push({
        customerName: it.customerName,
        customerCode: it.customerCode,
        companyName: it.companyName || '',
      });
    }

    suggestions.sort((a, b) => a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('[Excluded customers] suggest error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
