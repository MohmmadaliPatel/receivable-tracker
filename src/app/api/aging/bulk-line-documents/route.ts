import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/simple-auth';
import { getLineItemsForGroup } from '@/lib/aging-service';

export type BulkLineDocumentRow = {
  id: string;
  documentNo: string;
  customerName: string;
  customerCode: string;
};

/**
 * Returns line-level invoice rows (document no + customer) for PDF filename matching in bulk preview.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as { importId?: string; lineItemIds?: string[] };
    const importId = typeof body.importId === 'string' ? body.importId.trim() : '';
    const rawIds = Array.isArray(body.lineItemIds) ? body.lineItemIds : [];
    const lineItemIds = [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))];

    if (!importId) {
      return NextResponse.json({ error: 'importId is required' }, { status: 400 });
    }
    if (lineItemIds.length === 0) {
      return NextResponse.json({ lines: [] as BulkLineDocumentRow[] });
    }

    const items = await getLineItemsForGroup(user.id, importId, lineItemIds);

    const lines: BulkLineDocumentRow[] = items.map((it) => ({
      id: it.id,
      documentNo: it.documentNo || '',
      customerName: it.customerName,
      customerCode: it.customerCode,
    }));

    return NextResponse.json({ lines });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load line documents';
    console.error('[bulk-line-documents]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
