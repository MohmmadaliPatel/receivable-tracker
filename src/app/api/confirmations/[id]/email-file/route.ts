import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import { readEmailFile, emlPathBesidePdf } from '@/lib/confirmation-service';
import * as fs from 'fs';
import * as path from 'path';
import type { ConfirmationRecord } from '@prisma/client';

function resolvePdfPathForEmailFile(
  record: ConfirmationRecord,
  type: string,
  followupNumberParam: string | null,
  responseIndexParam: string | null
): string | null {
  if (type === 'sent') return record.sentEmailFilePath;
  if (type === 'response') {
    const idx = responseIndexParam ? parseInt(responseIndexParam, 10) : NaN;
    if (!Number.isNaN(idx) && record.responsesJson) {
      try {
        const arr = JSON.parse(record.responsesJson) as { filePath?: string }[];
        if (arr[idx]?.filePath) return arr[idx].filePath!;
      } catch {
        /* ignore */
      }
    }
    return record.responseEmailFilePath;
  }
  if (type === 'followup') {
    const n = followupNumberParam ? parseInt(followupNumberParam, 10) : NaN;
    if (!Number.isNaN(n) && record.followupsJson) {
      try {
        const list = JSON.parse(record.followupsJson) as { followupNumber: number; filePath: string }[];
        const entry = list.find((f) => f.followupNumber === n);
        if (entry?.filePath) return entry.filePath;
      } catch {
        /* ignore */
      }
    }
    return record.followupEmailFilePath;
  }
  return null;
}

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// GET /api/confirmations/[id]/email-file?type=sent|followup|response&format=pdf|eml&followupNumber=N
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'sent';
  const format = searchParams.get('format') || 'pdf';
  const followupNumber = searchParams.get('followupNumber');
  const responseIndex = searchParams.get('responseIndex');

  const record = await prisma.confirmationRecord.findFirst({
    where: { id },
  });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filePath = resolvePdfPathForEmailFile(record, type, followupNumber, responseIndex);

  if (!filePath) {
    return NextResponse.json({ error: 'No email file available for this type' }, { status: 404 });
  }

  if (format === 'eml') {
    if (!filePath.endsWith('.pdf')) {
      return NextResponse.json({ error: 'EML is only available alongside PDF saves' }, { status: 404 });
    }
    const emlPath = emlPathBesidePdf(filePath);
    if (!fs.existsSync(emlPath)) {
      return NextResponse.json({ error: 'No .eml file saved for this email (MIME export may have failed)' }, { status: 404 });
    }
    const content = fs.readFileSync(emlPath);
    const base = path.basename(emlPath);
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'message/rfc822',
        'Content-Disposition': `attachment; filename="${base}"`,
      },
    });
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
