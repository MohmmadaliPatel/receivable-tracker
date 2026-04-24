import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';
import { ingestAgingSnapshot } from '@/lib/aging-snapshot-ingest';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) || 'append';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB.' },
        { status: 400 }
      );
    }

    if (mode === 'replace') {
      const existingImports = await prisma.agingImport.findMany({
        where: { userId: user.id },
        select: { id: true, sourceFilePath: true },
      });
      for (const imp of existingImports) {
        if (imp.sourceFilePath) {
          const { unlink } = await import('fs/promises');
          const { join } = await import('path');
          const full = join(process.cwd(), imp.sourceFilePath);
          await unlink(full).catch(() => {});
        }
        await prisma.agingImport.delete({ where: { id: imp.id } });
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const out = await ingestAgingSnapshot({
      buffer,
      originalName: file.name,
      userId: user.id,
    });

    return NextResponse.json(
      {
        success: true,
        snapshotId: out.snapshotId,
        importId: out.snapshotId,
        fileName: out.fileName,
        lineCount: out.rowCount,
        rowCount: out.rowCount,
        customerCount: out.customerCount,
        excludedCount: out.excludedCount,
        chaseCount: out.chaseCount,
        pruned: out.pruned,
        sourceFilePath: out.sourceFilePath,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Aging Upload] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process upload';
    const isValidation =
      typeof message === 'string' &&
      (message.includes('No valid data') || message.includes('file format'));
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 400 : 500 }
    );
  }
}
