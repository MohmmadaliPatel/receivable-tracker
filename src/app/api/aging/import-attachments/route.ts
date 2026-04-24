import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getCurrentUser } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import { AGING_IMPORT_ATTACH_BASE } from '@/lib/aging-import-attachments';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const importId = request.nextUrl.searchParams.get('importId')?.trim();
    if (!importId) {
      return NextResponse.json({ error: 'Missing importId' }, { status: 400 });
    }
    const imp = await prisma.agingImport.findFirst({
      where: { id: importId, userId: user.id },
    });
    if (!imp) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }
    const rows = await prisma.agingImportCustomerAttachment.findMany({
      where: { userId: user.id, importId },
      orderBy: { customerName: 'asc' },
    });
    return NextResponse.json({
      attachments: rows.map((r) => ({
        id: r.id,
        customerCode: r.customerCode,
        customerName: r.customerName,
        fileName: r.fileName,
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[import-attachments GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const importId = request.nextUrl.searchParams.get('importId')?.trim();
    const customerCode = request.nextUrl.searchParams.get('customerCode')?.trim();
    if (!importId || !customerCode) {
      return NextResponse.json({ error: 'Missing importId or customerCode' }, { status: 400 });
    }
    const row = await prisma.agingImportCustomerAttachment.findFirst({
      where: { userId: user.id, importId, customerCode },
    });
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const abs = join(process.cwd(), row.filePath);
    if (existsSync(abs)) {
      try {
        await unlink(abs);
      } catch {
        // ignore
      }
    }
    const parent = join(
      process.cwd(),
      AGING_IMPORT_ATTACH_BASE,
      user.id,
      importId
    );
    if (existsSync(parent)) {
      try {
        const { readdir, rmdir } = await import('fs/promises');
        const rest = await readdir(parent);
        if (rest.length === 0) await rmdir(parent);
      } catch {
        // ignore
      }
    }
    await prisma.agingImportCustomerAttachment.delete({ where: { id: row.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[import-attachments DELETE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
