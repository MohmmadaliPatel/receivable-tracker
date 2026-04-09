import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// POST /api/confirmations/entity-attachment
// Upload an authority letter for all records belonging to a given entity
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const entityName = formData.get('entityName') as string | null;
  const category = formData.get('category') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!entityName && !category) {
    return NextResponse.json({ error: 'entityName or category is required' }, { status: 400 });
  }

  // Build where clause — both, either, or just one filter
  const where: Record<string, unknown> = {};
  if (entityName) where.entityName = entityName;
  if (category) where.category = category;

  const records = await prisma.confirmationRecord.findMany({ where });

  if (records.length === 0) {
    const scope = entityName && category
      ? `entity "${entityName}" / category "${category}"`
      : entityName ? `entity "${entityName}"` : `category "${category}"`;
    return NextResponse.json({ error: `No records found for ${scope}` }, { status: 404 });
  }

  // Save the file under an appropriate attachment folder
  const safeEntity = entityName
    ? entityName.replace(/[^a-zA-Z0-9._-\s]/g, '').trim().substring(0, 80)
    : '_all_entities';
  const safeCat = category ? category.replace(/[^a-zA-Z0-9._-\s]/g, '').trim().substring(0, 80) : '';
  const attachmentsDir = safeCat
    ? path.join(process.cwd(), 'attachments', 'entities', safeEntity, safeCat)
    : path.join(process.cwd(), 'attachments', 'entities', safeEntity);
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(attachmentsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  await prisma.confirmationRecord.updateMany({
    where,
    data: {
      attachmentPath: filePath,
      attachmentName: file.name,
    },
  });

  return NextResponse.json({
    success: true,
    updatedCount: records.length,
    attachmentName: file.name,
    entityName,
  });
}
