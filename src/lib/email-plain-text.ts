/** Strip HTML to plain text (browser). */
export function htmlEmailToPlainText(html: string): string {
  if (typeof window === 'undefined') {
    return stripHtmlFallback(html);
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = doc.body?.innerText ?? '';
    return text.replace(/\r\n/g, '\n').trim();
  } catch {
    return stripHtmlFallback(html);
  }
}

function stripHtmlFallback(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Convert plain text to a minimal safe HTML fragment for email bodies. */
export function plainTextToHtmlBody(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const withBreaks = escaped.split(/\r?\n/).join('<br/>');
  return `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${withBreaks}</div>`;
}

export function plainTextsEqual(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
}
