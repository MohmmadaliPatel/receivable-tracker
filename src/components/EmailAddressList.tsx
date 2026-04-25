import { parseEmailAddresses } from '@/lib/email-parser';

type Props = {
  /** Raw string from DB (commas, semicolons, or "Name <email>") */
  value: string | null | undefined;
  /** Optional visible label above the list */
  label?: string;
  /** Text when empty */
  emptyLabel?: string;
  className?: string;
  /** Slightly dimmer for CC column */
  variant?: 'default' | 'muted';
};

/**
 * Renders one or more email addresses as a vertical list, not a comma-joined line.
 */
export function EmailAddressList({
  value,
  label,
  emptyLabel = '—',
  className = '',
  variant = 'default',
}: Props) {
  const emails = parseEmailAddresses(value ?? '');

  if (emails.length === 0) {
    return (
      <div className={className}>
        {label && (
          <span className="text-[11px] font-medium text-gray-500 block mb-0.5">{label}</span>
        )}
        <span className={variant === 'muted' ? 'text-gray-400' : 'text-gray-500'}>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className={className}>
      {label && (
        <span className="text-[11px] font-medium text-gray-500 block mb-0.5">{label}</span>
      )}
      <ul
        className={`list-disc pl-4 space-y-0.5 text-sm ${
          variant === 'muted' ? 'text-gray-600' : 'text-gray-800'
        } break-all`}
      >
        {emails.map((e) => (
          <li key={e} className="marker:text-gray-400">
            {e}
          </li>
        ))}
      </ul>
    </div>
  );
}

type CompactCellProps = {
  emailTo: string | null | undefined;
  emailCc: string | null | undefined;
  /** Max addresses shown per To/Cc before “+N more” */
  maxVisible?: number;
  showConflict?: boolean;
};

/**
 * Compact To/Cc for tables: one short line per field, +N more, full list in title tooltip.
 */
export function CompactEmailTableCell({
  emailTo,
  emailCc,
  maxVisible = 2,
  showConflict,
}: CompactCellProps) {
  const toList = parseEmailAddresses(emailTo ?? '');
  const ccList = parseEmailAddresses(emailCc ?? '');

  const renderField = (label: string, list: string[], muted: boolean) => {
    if (list.length === 0) {
      return (
        <div className="min-w-0">
          <span className="text-[10px] font-semibold text-gray-500">{label} </span>
          <span className="text-xs text-gray-400">—</span>
        </div>
      );
    }
    const shown = list.slice(0, maxVisible);
    const rest = list.length - shown.length;
    const title = list.join(' · ');
    return (
      <div className="min-w-0" title={title}>
        <span className="text-[10px] font-semibold text-gray-500">{label} </span>
        <span
          className={`text-xs break-all ${muted ? 'text-gray-600' : 'text-gray-800'}`}
        >
          {shown.join(', ')}
          {rest > 0 && <span className="text-gray-500 font-medium"> +{rest} more</span>}
        </span>
      </div>
    );
  };

  return (
    <div className="min-w-0 max-w-[min(18rem,32vw)] py-0.5 space-y-0.5">
      {renderField('To', toList, false)}
      {renderField('Cc', ccList, true)}
      {showConflict && (
        <span className="block text-amber-800 text-[10px] font-medium">(emails differ)</span>
      )}
    </div>
  );
}
