import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import { readEmailFile } from '@/lib/confirmation-service';
import * as fs from 'fs';
import * as path from 'path';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// GET /api/confirmations/[id]/email-file?type=sent|followup|response
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'sent';

  const record = await prisma.confirmationRecord.findFirst({
    where: { id },
  });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let filePath: string | null = null;
  if (type === 'sent') filePath = record.sentEmailFilePath;
  else if (type === 'followup') filePath = record.followupEmailFilePath;
  else if (type === 'response') filePath = record.responseEmailFilePath;

  if (!filePath) {
    return NextResponse.json({ error: 'No email file available for this type' }, { status: 404 });
  }

  // PDF files — return binary for iframe/embed preview
  if (filePath.endsWith('.pdf')) {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Email file not found on disk' }, { status: 404 });
    }
    const content = fs.readFileSync(filePath);
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
      },
    });
  }

  // Legacy HTML files
  const content = readEmailFile(filePath);
  if (!content) {
    return NextResponse.json({ error: 'Email file not found on disk' }, { status: 404 });
  }

  return NextResponse.json({ html: content, filePath, type });
}
