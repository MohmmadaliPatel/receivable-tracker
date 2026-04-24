import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';
import {
  listCustomerEmailsPage,
  upsertCustomerEmail,
  updateCustomerEmailById,
  deleteCustomerEmail,
  buildCustomerEmailsExport,
  importCustomerEmailsFromCsv,
  syncCustomerEmailsFromImports,
  CustomerEmailInput,
  type CustomerEmailSortField,
} from '@/lib/customer-email-directory';

const SORT_FIELDS: readonly CustomerEmailSortField[] = [
  'keyValue',
  'companyName',
  'emailTo',
  'emailCc',
  'keyType',
  'updatedAt',
];

// Paginated list (server-side sort, filter, pagination)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyTypeList = searchParams
      .getAll('keyType')
      .map((s) => s.trim())
      .filter((s): s is 'customer_name' | 'customer_code' =>
        s === 'customer_name' || s === 'customer_code'
      );
    const single = searchParams.get('keyType') as 'customer_name' | 'customer_code' | null;
    const keyTypesFromQuery =
      keyTypeList.length > 0
        ? keyTypeList
        : single === 'customer_name' || single === 'customer_code'
          ? [single]
          : undefined;
    const search = searchParams.get('search')?.trim() || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10) || 25));
    const sortByRaw = searchParams.get('sortBy') || 'keyValue';
    const sortBy: CustomerEmailSortField = (SORT_FIELDS as readonly string[]).includes(sortByRaw)
      ? (sortByRaw as CustomerEmailSortField)
      : 'keyValue';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';
    const companyNames = searchParams.getAll('companyName').map((s) => s.trim()).filter(Boolean);
    const keyValues = searchParams.getAll('keyValue').map((s) => s.trim()).filter(Boolean);
    const emailTos = searchParams.getAll('emailTo').map((s) => s.trim()).filter(Boolean);
    const emailCcs = searchParams.getAll('emailCc').map((s) => s.trim()).filter(Boolean);

    const { entries, total, filterOptions } = await listCustomerEmailsPage(user.id, {
      keyTypes: keyTypesFromQuery,
      search: search || undefined,
      companyNames: companyNames.length > 0 ? companyNames : undefined,
      keyValues: keyValues.length > 0 ? keyValues : undefined,
      emailTos: emailTos.length > 0 ? emailTos : undefined,
      emailCcs: emailCcs.length > 0 ? emailCcs : undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });

    return NextResponse.json({ emails: entries, total, page, pageSize, filterOptions });
  } catch (error) {
    console.error('[Customer Emails] GET error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch customer emails';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Create or update customer email
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { keyType, keyValue, companyName, emailTo, emailCc } = body;

    if (!keyType || !keyValue || !emailTo) {
      return NextResponse.json(
        { error: 'Missing required fields: keyType, keyValue, emailTo' },
        { status: 400 }
      );
    }

    // Validate keyType
    if (!['customer_name', 'customer_code'].includes(keyType)) {
      return NextResponse.json(
        { error: 'Invalid keyType. Must be customer_name or customer_code' },
        { status: 400 }
      );
    }

    const input: CustomerEmailInput = {
      keyType,
      keyValue,
      companyName,
      emailTo,
      emailCc,
    };

    const result = await upsertCustomerEmail(user.id, input);

    return NextResponse.json({
      success: true,
      email: result,
    });
  } catch (error) {
    console.error('[Customer Emails] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to save customer email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Update customer email (inline edit)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, keyValue, companyName, emailTo, emailCc } = body;

    if (!id || !keyValue || !emailTo) {
      return NextResponse.json(
        { error: 'Missing required fields: id, keyValue, emailTo' },
        { status: 400 }
      );
    }



    const email = await updateCustomerEmailById(user.id, id, {
      keyValue: String(keyValue),
      companyName: companyName ?? null,
      emailTo: String(emailTo),
      emailCc: emailCc ?? null,
    });

    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error('[Customer Emails] PATCH error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update';
    const status = message === 'Entry not found' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

// Delete customer email(s) — supports single id via query param or bulk ids via body
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single delete via query param (backward compatible)
    if (id) {
      await deleteCustomerEmail(user.id, id);
      return NextResponse.json({ success: true });
    }

    // Bulk delete via request body: { deleteAll: true } or { ids: string[] }
    try {
      const body = await request.json();
      const deleteAll = body?.deleteAll === true;
      const ids: unknown = body?.ids;

      if (deleteAll) {
        if (Array.isArray(ids) && ids.length > 0) {
          return NextResponse.json(
            { error: 'Cannot combine deleteAll with ids' },
            { status: 400 }
          );
        }
        const result = await prisma.customerEmailEntry.deleteMany({
          where: { userId: user.id },
        });
        return NextResponse.json({ success: true, deleted: result.count });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'Missing email ID(s)' }, { status: 400 });
      }

      const result = await prisma.customerEmailEntry.deleteMany({
        where: {
          id: { in: ids as string[] },
          userId: user.id,
        },
      });

      return NextResponse.json({ success: true, deleted: result.count });
    } catch {
      return NextResponse.json({ error: 'Missing email ID(s)' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Customer Emails] DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete customer email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Generate CSV export
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, keyType, csvContent } = body;

    if (action === 'export') {
      // Export to CSV
      if (!keyType || !['customer_name', 'customer_code'].includes(keyType)) {
        return NextResponse.json(
          { error: 'Invalid keyType for export' },
          { status: 400 }
        );
      }

      const csv = await buildCustomerEmailsExport(user.id, keyType);

      return NextResponse.json({ csv });
    }

    if (action === 'import') {
      // Import from CSV
      if (!keyType || !['customer_name', 'customer_code'].includes(keyType)) {
        return NextResponse.json(
          { error: 'Invalid keyType for import' },
          { status: 400 }
        );
      }

      if (!csvContent) {
        return NextResponse.json(
          { error: 'Missing csvContent for import' },
          { status: 400 }
        );
      }

      const result = await importCustomerEmailsFromCsv(user.id, csvContent, keyType);

      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    if (action === 'sync') {
      // Sync from imports
      const result = await syncCustomerEmailsFromImports(user.id);

      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[Customer Emails] PUT error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
