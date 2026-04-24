/**
 * Server-side list helpers for receivables bulk-email customer groups.
 */

export type GroupListRow = {
  groupKey: string;
  lineItemIds: string[];
  lineCount: number;
  emailTo: string;
  emailConflict: boolean;
  companyName: string;
  customerName: string;
  customerCode: string;
  emailCount: number;
  followupCount: number;
  totalEmailsCount: number;
  lastSentAt: string | null;
  hasResponse: boolean;
  hasUnansweredSent: boolean;
};

export type GroupStatusFilter = 'all' | 'not_sent' | 'no_response' | 'followup' | 'response';

export function groupStatusLabel(g: GroupListRow): Exclude<GroupStatusFilter, 'all'> {
  if (g.hasResponse) return 'response';
  if (g.totalEmailsCount === 0) return 'not_sent';
  if (g.followupCount >= 1) return 'followup';
  return 'no_response';
}

const SORT_FIELDS = [
  'customerName',
  'customerCode',
  'companyName',
  'lineCount',
  'totalEmailsCount',
  'lastSentAt',
] as const;
export type GroupSortField = (typeof SORT_FIELDS)[number];

export function isGroupSortField(s: string | null): s is GroupSortField {
  return s != null && (SORT_FIELDS as readonly string[]).includes(s);
}

export function filterAndSortGroups(
  groups: GroupListRow[],
  options: {
    search?: string;
    status?: GroupStatusFilter;
    /** Multi status (e.g. column filter); if non-empty, overrides single `status` except `all` */
    statuses?: Set<Exclude<GroupStatusFilter, 'all'>> | null;
    customerNames?: Set<string> | null;
    customerCodes?: Set<string> | null;
    companyNames?: Set<string> | null;
    emailTos?: Set<string> | null;
    sortBy?: GroupSortField;
    sortOrder?: 'asc' | 'desc';
  }
): GroupListRow[] {
  const {
    search,
    status = 'all',
    statuses,
    customerNames,
    customerCodes,
    companyNames,
    emailTos,
    sortBy = 'customerName',
    sortOrder = 'asc',
  } = options;

  let list = groups;

  const q = search?.trim().toLowerCase();
  if (q) {
    list = list.filter((g) => {
      return (
        g.groupKey.toLowerCase().includes(q) ||
        (g.companyName || '').toLowerCase().includes(q) ||
        (g.customerName || '').toLowerCase().includes(q) ||
        (g.customerCode || '').toLowerCase().includes(q) ||
        (g.emailTo || '').toLowerCase().includes(q)
      );
    });
  }

  if (statuses && statuses.size > 0) {
    list = list.filter((g) => statuses.has(groupStatusLabel(g)));
  } else if (status !== 'all') {
    list = list.filter((g) => groupStatusLabel(g) === status);
  }

  if (customerNames && customerNames.size > 0) {
    list = list.filter((g) => customerNames.has((g.customerName || '').trim()));
  }
  if (customerCodes && customerCodes.size > 0) {
    list = list.filter((g) => customerCodes.has((g.customerCode || '').trim()));
  }
  if (companyNames && companyNames.size > 0) {
    list = list.filter((g) => companyNames.has((g.companyName || '').trim()));
  }
  if (emailTos && emailTos.size > 0) {
    list = list.filter((g) => emailTos.has((g.emailTo || '').trim()));
  }

  const dir = sortOrder === 'desc' ? -1 : 1;
  const sorted = [...list].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'customerName':
        cmp = (a.customerName || '').localeCompare(b.customerName || '', undefined, { sensitivity: 'base' });
        break;
      case 'customerCode':
        cmp = (a.customerCode || '').localeCompare(b.customerCode || '', undefined, { sensitivity: 'base' });
        break;
      case 'companyName':
        cmp = (a.companyName || '').localeCompare(b.companyName || '', undefined, { sensitivity: 'base' });
        break;
      case 'lineCount':
        cmp = a.lineCount - b.lineCount;
        break;
      case 'totalEmailsCount':
        cmp = a.totalEmailsCount - b.totalEmailsCount;
        break;
      case 'lastSentAt': {
        const ta = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0;
        const tb = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0;
        cmp = ta - tb;
        break;
      }
      default:
        cmp = 0;
    }
    return cmp * dir;
  });

  return sorted;
}

const FACET_CAP = 500;

export function companyNameFacets(groups: GroupListRow[]): string[] {
  const set = new Set<string>();
  for (const g of groups) {
    const n = (g.companyName || '').trim();
    if (n) set.add(n);
  }
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .slice(0, FACET_CAP);
}

function distinctSorted(values: string[]): string[] {
  return Array.from(new Set(values))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .slice(0, FACET_CAP);
}

export function groupFilterOptions(groups: GroupListRow[]): {
  companyName: string[];
  customerName: string[];
  customerCode: string[];
  emailTo: string[];
  status: string[];
} {
  return {
    companyName: companyNameFacets(groups),
    customerName: distinctSorted(groups.map((g) => (g.customerName || '').trim()).filter(Boolean)),
    customerCode: distinctSorted(groups.map((g) => (g.customerCode || '').trim()).filter(Boolean)),
    emailTo: distinctSorted(groups.map((g) => (g.emailTo || '').trim()).filter(Boolean)),
    status: ['not_sent', 'no_response', 'followup', 'response'],
  };
}
