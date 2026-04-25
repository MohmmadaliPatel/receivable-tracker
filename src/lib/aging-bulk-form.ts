import type { ResolvedMailAttachment } from './aging-import-attachments';

export const BULK_PDF_FIELD_PREFIX = 'pdf:';

function isFileLike(v: FormDataEntryValue | null): v is File {
  return v != null && typeof v === 'object' && 'arrayBuffer' in v && 'size' in v;
}

export async function localPdfsFromFormData(form: FormData): Promise<Map<string, ResolvedMailAttachment>> {
  const map = new Map<string, ResolvedMailAttachment>();
  for (const [key, v] of form.entries()) {
    if (!key.startsWith(BULK_PDF_FIELD_PREFIX)) continue;
    if (!isFileLike(v) || v.size === 0) continue;
    const docNo = decodeURIComponent(key.slice(BULK_PDF_FIELD_PREFIX.length));
    if (!docNo.trim()) continue;
    const buffer = Buffer.from(await v.arrayBuffer());
    const name =
      v.name && v.name.toLowerCase().endsWith('.pdf') ? v.name : `${docNo}.pdf`;
    map.set(docNo.trim(), {
      name,
      contentBytes: buffer.toString('base64'),
      contentType: 'application/pdf',
    });
  }
  return map;
}

export function stripHtmlToPlain(html: string, max = 2000): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
