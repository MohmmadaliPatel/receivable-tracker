/**
 * Microsoft Graph /messages/{id} and createReply expect the raw id.
 * Some legacy data may use "messageId::conversationId" — use only the first segment.
 */
export function graphMessageIdForCreateReply(stored: string | null | undefined): string {
  if (stored == null) return '';
  const t = String(stored).trim();
  if (!t) return '';
  const i = t.indexOf('::');
  return i >= 0 ? t.slice(0, i).trim() : t;
}
