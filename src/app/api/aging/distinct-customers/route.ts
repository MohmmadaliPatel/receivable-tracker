import { NextRequest, NextResponse } from 'next/server';
import { getDistinctCustomers } from '@/lib/aging-service';
import { getCurrentUser } from '@/lib/simple-auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const importId = searchParams.get('importId');

    if (!importId) {
      return NextResponse.json({ error: 'Missing importId parameter' }, { status: 400 });
    }

    const customers = await getDistinctCustomers(user.id, importId);

    return NextResponse.json({ customers });
  } catch (error) {
    console.error('[Aging Distinct Customers] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch customers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
