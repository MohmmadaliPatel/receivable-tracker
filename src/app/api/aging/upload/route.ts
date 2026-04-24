import { NextRequest, NextResponse } from 'next/server';
import { parseAgingExcel, importAgingData } from '@/lib/aging-service';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';

export async function POST(request: NextRequest) {
  try {
    // Get current user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) || 'append';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    // Check file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB.' },
        { status: 400 }
      );
    }

    // If replace mode, delete existing imports for this user
    if (mode === 'replace') {
      const existingImports = await prisma.agingImport.findMany({
        where: { userId: user.id },
        select: { id: true },
      });

      for (const imp of existingImports) {
        await prisma.agingImport.delete({
          where: { id: imp.id },
        });
      }
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse Excel file
    const parsedRows = parseAgingExcel(buffer);

    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid data found in the Excel file. Please check the file format.' },
        { status: 400 }
      );
    }

    // Import data into database
    const result = await importAgingData(user.id, file.name, parsedRows);

    return NextResponse.json({
      success: true,
      importId: result.importId,
      fileName: result.fileName,
      lineCount: result.lineCount,
      excludedCount: result.excludedCount,
      chaseCount: result.chaseCount,
    });
  } catch (error) {
    console.error('[Aging Upload] Error:', error);
    
    const message = error instanceof Error ? error.message : 'Failed to process upload';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
