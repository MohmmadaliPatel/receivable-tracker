import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { buffer } from 'node:stream/consumers';
import { getCurrentUser } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import { listTemplateCustomersForImport } from '@/lib/aging-import-attachments';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const importId = searchParams.get('importId')?.trim();
    if (!importId) {
      return NextResponse.json({ error: 'Missing importId' }, { status: 400 });
    }

    const companyNames = searchParams.getAll('companyNames').map((s) => s.trim()).filter(Boolean);
    const companyFilter = companyNames.length > 0 ? companyNames : null;

    const imp = await prisma.agingImport.findFirst({
      where: { id: importId, userId: user.id },
    });
    if (!imp) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    const customers = await listTemplateCustomersForImport(user.id, importId, companyFilter);

    if (customers.length === 0) {
      return NextResponse.json(
        { error: 'No customers with positive total balance for this filter.' },
        { status: 400 }
      );
    }

    const archive = archiver('zip', { zlib: { level: 6 } });
    const out = new PassThrough();
    archive.pipe(out);
    for (const c of customers) {
      // Zip directory entry only (name ends with `/`) — no `.placeholder` file inside.
      archive.append(Buffer.alloc(0), { name: `${c.folderName}/` });
    }
    const bufPromise = buffer(out);
    await archive.finalize();
    const buf = await bufPromise;

    const safeName = `invoice-attachments-template-${importId.slice(0, 8)}.zip`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeName)}"`,
        'Content-Length': String(buf.length),
      },
    });
  } catch (error) {
    console.error('[import-attachments template-zip] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to build template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
