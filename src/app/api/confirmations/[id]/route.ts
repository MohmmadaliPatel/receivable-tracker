import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// GET /api/confirmations/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const record = await prisma.confirmationRecord.findFirst({
    where: { id },
  });

  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ record });
}

// PUT /api/confirmations/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { entityName, category, bankName, accountNumber, custId, emailTo, emailCc, remarks } = body;

  const existing = await prisma.confirmationRecord.findFirst({
    where: { id },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const record = await prisma.confirmationRecord.update({
    where: { id },
    data: {
      ...(entityName !== undefined && { entityName }),
      ...(category !== undefined && { category }),
      ...(bankName !== undefined && { bankName }),
      ...(accountNumber !== undefined && { accountNumber }),
      ...(custId !== undefined && { custId }),
      ...(emailTo !== undefined && { emailTo }),
      ...(emailCc !== undefined && { emailCc }),
      ...(remarks !== undefined && { remarks }),
    },
  });

  return NextResponse.json({ record });
}

// PATCH /api/confirmations/[id] — reset response data so reply can be re-checked
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.confirmationRecord.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  if (body.action === 'reset-response') {
    const newStatus = existing.followupSentAt ? 'followup_sent' : (existing.sentAt ? 'sent' : 'not_sent');
    const record = await prisma.confirmationRecord.update({
      where: { id },
      data: {
        status: newStatus,
        responseReceivedAt: null,
        responseMessageId: null,
        responseSubject: null,
        responseBody: null,
        responseHtmlBody: null,
        responseFromEmail: null,
        responseFromName: null,
        responseEmailFilePath: null,
        responseHasAttachments: false,
        responseAttachmentsJson: null,
      },
    });
    return NextResponse.json({ record });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// DELETE /api/confirmations/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.confirmationRecord.findFirst({
    where: { id },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.confirmationRecord.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
