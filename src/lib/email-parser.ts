/**
 * Robust email address parser.
 *
 * Handles formats like:
 *   - plain@email.com
 *   - Name <email@domain.com>
 *   - "Name" <email@domain.com>
 *   - Multiple addresses separated by , or ; or newlines
 *   - Mixed formats in one string
 */

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Extract all valid email addresses from a raw string that may contain
 * names, angle brackets, commas, semicolons, or newlines.
 *
 * Returns a deduplicated array of lowercase email addresses.
 */
export function parseEmailAddresses(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];

  const matches = raw.match(EMAIL_RE);
  if (!matches) return [];

  // Deduplicate (case-insensitive) and return lowercase
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }
  return result;
}

/**
 * Join an array of email addresses into a comma-separated string.
 */
export function joinEmails(emails: string[]): string {
  return emails.join(', ');
}

/**
 * Parse a stored comma-separated email string into an array.
 * Handles both comma and semicolon separators.
 */
export function splitStoredEmails(stored: string | null | undefined): string[] {
  if (!stored || !stored.trim()) return [];
  return stored
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0 && e.includes('@'));
}
