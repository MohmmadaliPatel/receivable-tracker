import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/simple-auth';
import { reapplyExclusionsForLatestImport } from '@/lib/aging-exclusions';

function normalizeKey(v: string): string {
  return v.toLowerCase().trim();
}

function escapeCsv(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyTypeSingle = searchParams.get('keyType') as 'customer_name' | 'customer_code' | null;
    const keyTypeList = searchParams
      .getAll('keyType')
      .map((s) => s.trim())
      .filter((s): s is 'customer_name' | 'customer_code' => ['customer_name', 'customer_code'].includes(s));
    const keyValueList = searchParams.getAll('keyValue').map((s) => s.trim()).filter(Boolean);
    const reasonParams = searchParams.getAll('reason').map((s) => s.trim());
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));
    const skip = (page - 1) * pageSize;

    const sortByRaw = searchParams.get('sortBy') || 'keyValue';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';
    const validSort = ['keyValue', 'keyType', 'reason', 'createdAt', 'updatedAt'] as const;
    const sortBy = (validSort as readonly string[]).includes(sortByRaw)
      ? (sortByRaw as (typeof validSort)[number])
      : 'keyValue';
    const orderBy: Record<string, 'asc' | 'desc'> = { [sortBy]: sortOrder };

    const wantsEmpty = reasonParams.includes('__empty__');
    const reasonOnly = reasonParams.filter((r) => r && r !== '__empty__');
    const andParts: Prisma.ExcludedCustomerWhereInput[] = [{ userId: user.id }];
    if (keyTypeList.length > 1) {
      andParts.push({ keyType: { in: keyTypeList } });
    } else if (keyTypeList.length === 1) {
      andParts.push({ keyType: keyTypeList[0]! });
    } else if (keyTypeSingle && ['customer_name', 'customer_code'].includes(keyTypeSingle)) {
      andParts.push({ keyType: keyTypeSingle });
    }
    if (keyValueList.length > 0) {
      andParts.push({ keyValue: { in: keyValueList } });
    }
    if (wantsEmpty && reasonOnly.length > 0) {
      andParts.push({
        OR: [
          { reason: { in: reasonOnly } },
          { reason: null },
          { reason: '' },
        ],
      });
    } else if (wantsEmpty) {
      andParts.push({ OR: [{ reason: null }, { reason: '' }] });
    } else if (reasonOnly.length > 0) {
      andParts.push({ reason: { in: reasonOnly } });
    }
    const where: Prisma.ExcludedCustomerWhereInput =
      andParts.length > 1 ? { AND: andParts } : andParts[0]!;

    const facetAnd: Prisma.ExcludedCustomerWhereInput[] = [{ userId: user.id }];
    if (keyTypeList.length > 1) facetAnd.push({ keyType: { in: keyTypeList } });
    else if (keyTypeList.length === 1) facetAnd.push({ keyType: keyTypeList[0]! });
    else if (keyTypeSingle && ['customer_name', 'customer_code'].includes(keyTypeSingle)) {
      facetAnd.push({ keyType: keyTypeSingle });
    }
    const facetWhere: Prisma.ExcludedCustomerWhereInput =
      facetAnd.length > 1 ? { AND: facetAnd } : facetAnd[0]!;

    const [rows, total, keyFacet, reasonFacet, hasEmptyReason] = await Promise.all([
      prisma.excludedCustomer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: orderBy as { keyValue?: 'asc' | 'desc' },
      }),
      prisma.excludedCustomer.count({ where }),
      prisma.excludedCustomer.findMany({
        where: facetWhere,
        select: { keyValue: true },
        distinct: ['keyValue'],
        take: 500,
        orderBy: { keyValue: 'asc' },
      }),
      prisma.excludedCustomer.findMany({
        where: facetWhere,
        select: { reason: true },
        distinct: ['reason'],
        take: 500,
        orderBy: { reason: 'asc' },
      }),
      prisma.excludedCustomer.findFirst({
        where: {
          AND: [facetWhere, { OR: [{ reason: null }, { reason: '' }] }],
        },
        select: { id: true },
      }),
    ]);

    const reasonOpts: string[] = reasonFacet
      .map((r) => r.reason)
      .filter((s): s is string => s != null && s.trim() !== '');
    if (hasEmptyReason) {
      reasonOpts.push('__empty__');
    }

    return NextResponse.json({
      entries: rows.map((r) => ({
        id: r.id,
        keyType: r.keyType,
        keyValue: r.keyValue,
        reason: r.reason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      pageSize,
      filterOptions: {
        keyType: ['customer_name', 'customer_code'],
        keyValue: keyFacet.map((k) => k.keyValue).filter(Boolean),
        reason: reasonOpts,
      },
    });
  } catch (error) {
    console.error('[Excluded customers] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Bulk mode
    if (Array.isArray(body.entries)) {
      type EntryInput = { keyType: string; keyValue: string; reason?: string };
      const inputs = (body.entries as EntryInput[]).filter(
        (e) => e.keyType && e.keyValue && ['customer_name', 'customer_code'].includes(e.keyType)
      );
      const seen = new Set<string>();
      const deduped: { userId: string; keyType: string; keyValue: string; reason: string | null }[] = [];
      for (const e of inputs) {
        const kv = normalizeKey(String(e.keyValue));
        const k = `${e.keyType}:${kv}`;
        if (!kv || seen.has(k)) continue;
        seen.add(k);
        deduped.push({
          userId: user.id,
          keyType: e.keyType,
          keyValue: kv,
          reason: e.reason ? String(e.reason).trim() : null,
        });
      }
      if (deduped.length === 0) {
        return NextResponse.json({ success: true, added: 0, skipped: 0 });
      }
      // SQLite doesn't support skipDuplicates — filter existing first
      const existing = await prisma.excludedCustomer.findMany({
        where: {
          userId: user.id,
          OR: deduped.map((d) => ({ keyType: d.keyType, keyValue: d.keyValue })),
        },
        select: { keyType: true, keyValue: true },
      });
      const existingSet = new Set(existing.map((e) => `${e.keyType}:${e.keyValue}`));
      const toCreate = deduped.filter((d) => !existingSet.has(`${d.keyType}:${d.keyValue}`));
      if (toCreate.length > 0) {
        await prisma.excludedCustomer.createMany({ data: toCreate });
        // Retroactively exclude matching line items in the latest import
        reapplyExclusionsForLatestImport(user.id).catch((e) =>
          console.error('[Excluded customers] reapply error:', e)
        );
      }
      return NextResponse.json({
        success: true,
        added: toCreate.length,
        skipped: deduped.length - toCreate.length,
      });
    }

    // Single mode
    const { keyType, keyValue, reason } = body;
    if (!keyType || !keyValue) {
      return NextResponse.json({ error: 'keyType and keyValue are required' }, { status: 400 });
    }
    if (!['customer_name', 'customer_code'].includes(keyType)) {
      return NextResponse.json({ error: 'Invalid keyType' }, { status: 400 });
    }
    const kv = normalizeKey(String(keyValue));
    if (!kv) {
      return NextResponse.json({ error: 'keyValue is empty' }, { status: 400 });
    }

    const created = await prisma.excludedCustomer.create({
      data: {
        userId: user.id,
        keyType,
        keyValue: kv,
        reason: reason ? String(reason).trim() : null,
      },
    });

    // Retroactively exclude matching line items in the latest import
    reapplyExclusionsForLatestImport(user.id).catch((e) =>
      console.error('[Excluded customers] reapply error:', e)
    );

    return NextResponse.json({ success: true, entry: created });
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'This customer is already excluded' }, { status: 400 });
    }
    console.error('[Excluded customers] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, keyValue, reason } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await prisma.excludedCustomer.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data: { keyValue?: string; reason?: string | null } = {};
    if (keyValue !== undefined) {
      const kv = normalizeKey(String(keyValue));
      if (!kv) {
        return NextResponse.json({ error: 'keyValue is empty' }, { status: 400 });
      }
      if (kv !== existing.keyValue) {
        const conflict = await prisma.excludedCustomer.findFirst({
          where: { userId: user.id, keyType: existing.keyType, keyValue: kv, id: { not: id } },
        });
        if (conflict) {
          return NextResponse.json({ error: 'Another entry already uses this key' }, { status: 400 });
        }
        data.keyValue = kv;
      }
    }
    if (reason !== undefined) {
      data.reason = reason ? String(reason).trim() : null;
    }

    const updated = await prisma.excludedCustomer.update({ where: { id }, data });

    // Reapply if the key value changed
    if (data.keyValue !== undefined) {
      reapplyExclusionsForLatestImport(user.id).catch((e) =>
        console.error('[Excluded customers] reapply error:', e)
      );
    }

    return NextResponse.json({ success: true, entry: updated });
  } catch (error) {
    console.error('[Excluded customers] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    await prisma.excludedCustomer.deleteMany({ where: { id, userId: user.id } });

    // Reapply so removed customers become visible again
    reapplyExclusionsForLatestImport(user.id).catch((e) =>
      console.error('[Excluded customers] reapply error:', e)
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Excluded customers] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, keyType } = body;
    if (action === 'export') {
      if (!keyType || !['customer_name', 'customer_code'].includes(keyType)) {
        return NextResponse.json({ error: 'keyType is required' }, { status: 400 });
      }
      const rows = await prisma.excludedCustomer.findMany({
        where: { userId: user.id, keyType },
        orderBy: { keyValue: 'asc' },
      });
      const header = keyType === 'customer_name' ? 'customer_name' : 'customer_code';
      const csv = `${header}\n${rows.map((r) => escapeCsv(r.keyValue)).join('\n')}`;
      return NextResponse.json({ csv });
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[Excluded customers] PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
