import { NextRequest, NextResponse } from 'next/server';
import { getCustomerGroups } from '@/lib/aging-service';
import { getCurrentUser } from '@/lib/simple-auth';
import {
  type GroupListRow,
  type GroupStatusFilter,
  filterAndSortGroups,
  groupFilterOptions,
  isGroupSortField,
  type GroupSortField,
} from '@/lib/aging-groups-list';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const importId = searchParams.get('importId');
    const grouping = (searchParams.get('grouping') as 'name' | 'code') || 'code';
    const companyCode = searchParams.get('companyCode') || undefined;
    const search = searchParams.get('search')?.trim() || undefined;

    const sortBy = isGroupSortField(searchParams.get('sortBy'))
      ? searchParams.get('sortBy')!
      : 'customerName';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';

    const statusKeys = searchParams
      .getAll('status')
      .map((s) => s.trim())
      .filter((s): s is Exclude<GroupStatusFilter, 'all'> =>
        ['not_sent', 'no_response', 'followup', 'response'].includes(s)
      );
    const statuses =
      statusKeys.length > 0 ? new Set(statusKeys) : null;

    const companyNameList = searchParams.getAll('companyNames').map((s) => s.trim()).filter(Boolean);
    const companyNames = companyNameList.length > 0 ? new Set(companyNameList) : null;
    const customerNameList = searchParams.getAll('customerName').map((s) => s.trim()).filter(Boolean);
    const customerNames = customerNameList.length > 0 ? new Set(customerNameList) : null;
    const customerCodeList = searchParams.getAll('customerCode').map((s) => s.trim()).filter(Boolean);
    const customerCodes = customerCodeList.length > 0 ? new Set(customerCodeList) : null;
    const emailToList = searchParams.getAll('emailTo').map((s) => s.trim()).filter(Boolean);
    const emailTos = emailToList.length > 0 ? new Set(emailToList) : null;

    const pageParam = searchParams.get('page');
    const paged = pageParam != null && pageParam !== '';
    const page = paged ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
    const pageSize = paged
      ? Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '15', 10) || 15))
      : Number.MAX_SAFE_INTEGER;

    if (!importId) {
      return NextResponse.json({ error: 'Missing importId parameter' }, { status: 400 });
    }

    if (!['name', 'code'].includes(grouping)) {
      return NextResponse.json(
        { error: 'Invalid grouping. Must be "name" or "code"' },
        { status: 400 }
      );
    }

    const rawGroups = (await getCustomerGroups(
      user.id,
      importId,
      grouping,
      companyCode
    )) as GroupListRow[];

    let list = filterAndSortGroups(rawGroups, {
      search,
      status: 'all',
      statuses,
      customerNames,
      customerCodes,
      companyNames,
      emailTos,
      sortBy: sortBy as GroupSortField,
      sortOrder,
    });

    const total = list.length;
    const filterOptions = groupFilterOptions(rawGroups);

    const groups = paged
      ? list.slice((page - 1) * pageSize, page * pageSize)
      : list;

    return NextResponse.json({
      groups,
      total,
      page: paged ? page : 1,
      pageSize: paged ? pageSize : total,
      filterOptions,
    });
  } catch (error) {
    console.error('[Aging Groups] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch groups';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
