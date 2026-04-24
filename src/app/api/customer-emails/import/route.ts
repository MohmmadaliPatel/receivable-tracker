import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/simple-auth';
import { importCustomerEmailsFromCsv } from '@/lib/customer-email-directory';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const keyType = formData.get('keyType');

    if (!file || typeof file === 'string' || !('text' in file)) {
      return NextResponse.json({ error: 'Missing CSV file' }, { status: 400 });
    }
    if (keyType !== 'customer_name' && keyType !== 'customer_code') {
      return NextResponse.json(
        { error: 'keyType must be customer_name or customer_code' },
        { status: 400 }
      );
    }

    const csvContent = await (file as File).text();
    if (!csvContent.trim()) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    const result = await importCustomerEmailsFromCsv(user.id, csvContent, keyType);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Customer Emails] Import error:', error);
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
