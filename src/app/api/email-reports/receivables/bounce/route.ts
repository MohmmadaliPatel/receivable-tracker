import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';

/**
 * Set or clear receivables bounce on `InvoiceChase` for the current user.
 * Body: { invoiceKey: string, bounced: boolean, bounceDetail?: string }
 */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { invoiceKey?: string; bounced?: boolean; bounceDetail?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const invoiceKey = typeof body.invoiceKey === 'string' ? body.invoiceKey.trim() : '';
  if (!invoiceKey) {
    return NextResponse.json({ error: 'invoiceKey is required' }, { status: 400 });
  }
  if (typeof body.bounced !== 'boolean') {
    return NextResponse.json({ error: 'bounced (boolean) is required' }, { status: 400 });
  }

  const now = new Date();
  const updated = await prisma.invoiceChase.updateMany({
    where: { userId: user.id, invoiceKey },
    data: {
      bouncedAt: body.bounced ? now : null,
      bounceDetail: body.bounced ? (body.bounceDetail?.trim() || null) : null,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: 'No invoice chase found for that key in your account' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, invoiceKey, bounced: body.bounced });
}
