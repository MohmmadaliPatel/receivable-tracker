import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';

/**
 * Distinct company codes: latest import, or a specific `importId` (same user).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const importIdParam = request.nextUrl.searchParams.get('importId')?.trim();

    let targetImport: { id: string } | null = null;

    if (importIdParam) {
      const imp = await prisma.agingImport.findFirst({
        where: { id: importIdParam, userId: user.id },
        select: { id: true },
      });
      if (!imp) {
        return NextResponse.json({ error: 'Import not found' }, { status: 404 });
      }
      targetImport = imp;
    } else {
      const latest = await prisma.agingImport.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      targetImport = latest;
    }

    if (!targetImport) {
      return NextResponse.json({ companies: [] as { companyCode: string; companyName: string }[] });
    }

    const rows = await prisma.agingLineItem.groupBy({
      by: ['companyCode', 'companyName'],
      where: {
        importId: targetImport.id,
        userId: user.id,
        excluded: false,
      },
    });

    const companies = rows
      .map((r) => ({ companyCode: r.companyCode, companyName: r.companyName || '' }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName) || a.companyCode.localeCompare(b.companyCode));

    return NextResponse.json({ companies });
  } catch (error) {
    console.error('[Aging distinct-companies] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
