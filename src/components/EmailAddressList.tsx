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
