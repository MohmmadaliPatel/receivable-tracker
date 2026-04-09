import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import { listConfirmationRecords, getEntityNames, CATEGORIES } from '@/lib/confirmation-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// GET /api/confirmations — list with filters
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityName = searchParams.getAll('entity');
  const category = searchParams.getAll('category');
  const status = searchParams.getAll('status');
  const search = searchParams.get('search') || undefined;
  const includeMetadata = searchParams.get('metadata') === 'true';

  const records = await listConfirmationRecords({
    entityName: entityName.length ? entityName : undefined,
    category: category.length ? category : undefined,
    status: status.length ? status : undefined,
    search,
  });

  if (includeMetadata) {
    const entityNames = await getEntityNames();
    return NextResponse.json({ records, entityNames, categories: CATEGORIES });
  }

  return NextResponse.json({ records });
}

// POST /api/confirmations — create single record
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { entityName, category, bankName, accountNumber, custId, emailTo, emailCc, remarks } = body;

  if (!entityName || !category || !emailTo) {
    return NextResponse.json(
      { error: 'Missing required fields: entityName, category, emailTo' },
      { status: 400 }
    );
  }

  const record = await prisma.confirmationRecord.create({
    data: {
      entityName,
      category,
      bankName,
      accountNumber,
      custId,
      emailTo,
      emailCc,
      remarks,
      userId: user.userId,
    },
  });

  return NextResponse.json({ record }, { status: 201 });
}
