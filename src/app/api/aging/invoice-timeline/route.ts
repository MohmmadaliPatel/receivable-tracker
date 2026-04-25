import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const invoiceKey = (request.nextUrl.searchParams.get('invoiceKey') || '').trim();
  if (!invoiceKey) {
    return NextResponse.json({ error: 'Missing invoiceKey' }, { status: 400 });
  }

  const chase = await prisma.invoiceChase.findUnique({
    where: {
      userId_invoiceKey: { userId: user.id, invoiceKey },
    },
  });

  if (!chase) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const emails = await prisma.email.findMany({
    where: { userId: user.id, agingInvoiceKey: invoiceKey },
    orderBy: { sentAt: 'asc' },
    include: { emailConfig: { select: { name: true, fromEmail: true } } },
  });

  let followups: unknown[] = [];
  if (chase.followupsJson) {
    try {
      followups = JSON.parse(chase.followupsJson);
    } catch {
      followups = [];
    }
  }
  let responses: unknown[] = [];
  if (chase.responsesJson) {
    try {
      responses = JSON.parse(chase.responsesJson);
    } catch {
      responses = [];
    }
  }

  return NextResponse.json({
    chase: {
      invoiceKey: chase.invoiceKey,
      documentNo: chase.documentNo,
      customerName: chase.customerName,
      customerCode: chase.customerCode,
      companyCode: chase.companyCode,
      companyName: chase.companyName,
      status: chase.status,
      emailCount: chase.emailCount,
      followupCount: chase.followupCount,
      sentAt: chase.sentAt?.toISOString() ?? null,
      lastFollowupAt: chase.lastFollowupAt?.toISOString() ?? null,
      lastResponseAt: chase.lastResponseAt?.toISOString() ?? null,
      sentMessageId: chase.sentMessageId,
      followupMessageId: chase.followupMessageId,
      responseMessageId: chase.responseMessageId,
      responseSubject: chase.responseSubject,
      responsePreview: chase.responsePreview,
      lastAgingSendFailedAt: chase.lastAgingSendFailedAt?.toISOString() ?? null,
      lastAgingSendError: chase.lastAgingSendError,
      bouncedAt: chase.bouncedAt?.toISOString() ?? null,
      bounceDetail: chase.bounceDetail,
      followups,
      responses,
    },
    emails: emails.map((e) => ({
      id: e.id,
      to: e.to,
      subject: e.subject,
      body: e.body,
      htmlBody: e.htmlBody,
      status: e.status,
      errorMessage: e.errorMessage,
      sentAt: e.sentAt.toISOString(),
      kind: e.kind,
      emailConfig: e.emailConfig,
    })),
  });
}
