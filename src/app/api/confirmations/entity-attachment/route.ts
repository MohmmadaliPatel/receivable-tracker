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

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!entityName) return NextResponse.json({ error: 'entityName is required' }, { status: 400 });

  // Find all records for this entity
  const records = await prisma.confirmationRecord.findMany({
    where: { userId: user.userId, entityName },
  });

  if (records.length === 0) {
    return NextResponse.json({ error: `No records found for entity: ${entityName}` }, { status: 404 });
  }

  // Save the file once under a shared entity attachment folder
  const safeEntity = entityName.replace(/[^a-zA-Z0-9._-\s]/g, '').trim().substring(0, 80);
  const attachmentsDir = path.join(process.cwd(), 'attachments', 'entities', safeEntity);
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(attachmentsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Update all matching records
  await prisma.confirmationRecord.updateMany({
    where: { userId: user.userId, entityName },
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
