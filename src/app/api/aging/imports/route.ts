import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';

// Get all imports for the user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [imports, visibleCountByImport, allCountByImport] = await Promise.all([
      prisma.agingImport.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, fileName: true, createdAt: true },
      }),
      prisma.agingLineItem.groupBy({
        by: ['importId'],
        where: { userId: user.id, excluded: false },
        _count: { _all: true },
      }),
      prisma.agingLineItem.groupBy({
        by: ['importId'],
        where: { userId: user.id },
        _count: { _all: true },
      }),
    ]);

    const visibleMap = new Map(visibleCountByImport.map((r) => [r.importId, r._count._all]));
    const allMap = new Map(allCountByImport.map((r) => [r.importId, r._count._all]));

    return NextResponse.json({
      imports: imports.map((imp) => {
        const total = allMap.get(imp.id) ?? 0;
        const visible = visibleMap.get(imp.id) ?? 0;
        return {
          id: imp.id,
          fileName: imp.fileName,
          createdAt: imp.createdAt,
          lineCount: visible,
          lineCountAll: total,
        };
      }),
    });
  } catch (error) {
    console.error('[Aging Imports] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch imports';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Delete an import
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const importId = searchParams.get('id');

    if (!importId) {
      return NextResponse.json({ error: 'Missing import ID' }, { status: 400 });
    }

    // Verify the import belongs to this user
    const existing = await prisma.agingImport.findFirst({
      where: { id: importId, userId: user.id },
      select: { id: true, sourceFilePath: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    if (existing.sourceFilePath) {
      const full = path.join(process.cwd(), existing.sourceFilePath);
      await unlink(full).catch(() => {});
    }

    // Delete the import (cascade will delete line items)
    await prisma.agingImport.delete({
      where: { id: importId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Aging Imports] Delete error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete import';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
