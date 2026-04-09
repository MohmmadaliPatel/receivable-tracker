import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import { generateEmailHtml, generateEmailSubject } from '@/lib/confirmation-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// GET /api/confirmations/[id]/preview
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const record = await prisma.confirmationRecord.findFirst({
    where: { id },
  });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const subject = generateEmailSubject(record.entityName);
  const html = generateEmailHtml(record.entityName, record.category);

  return NextResponse.json({ subject, html, record });
}
