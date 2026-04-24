import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the latest import for this user
    const latestImport = await prisma.agingImport.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestImport) {
      return NextResponse.json({ import: null, lineCount: 0 });
    }

    // Receivables-relevant: non-excluded lines only
    const lineCount = await prisma.agingLineItem.count({
      where: { importId: latestImport.id, userId: user.id, excluded: false },
    });

    const excludedCount = await prisma.agingLineItem.count({
      where: { importId: latestImport.id, userId: user.id, excluded: true },
    });

    const lineCountAll = lineCount + excludedCount;

    return NextResponse.json({
      import: {
        id: latestImport.id,
        fileName: latestImport.fileName,
        createdAt: latestImport.createdAt,
      },
      lineCount,
      excludedCount,
      lineCountAll,
    });
  } catch (error) {
    console.error('[Aging Line Items] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch line items';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
