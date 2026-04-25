import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/simple-auth';
import { EmailConfigService } from '@/lib/email-config-service';
import { GraphMailService } from '@/lib/graph-mail-service';
import { prisma } from '@/lib/prisma';

/**
 * Bulk local-PDF email send: multipart/form-data only. PDF bytes stay in memory (base64 for Graph) — never written to disk.
 * Uses the same active **Microsoft Graph** `EmailConfig` as `/api/send-email` (see `EmailConfigService.getActiveConfig()`).
 *
 * Form fields: `to`, `documentNumber`, optional `attachment` (one file);
 * `subject` (optional), `textBody` and/or `htmlBody` (optional, defaults if missing).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getStringField(form: FormData, key: string): string {
  const v = form.get(key);
  if (v == null) {
    return '';
  }
  return typeof v === 'string' ? v.trim() : '';
}

function isFileLike(v: FormDataEntryValue | null): v is File {
  return v != null && typeof v === 'object' && 'arrayBuffer' in v && 'name' in v;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const form = await request.formData();
    const to = getStringField(form, 'to');
    const documentNumber = getStringField(form, 'documentNumber');
    const subjectIn = getStringField(form, 'subject');
    const textBody = getStringField(form, 'textBody');
    const htmlBody = getStringField(form, 'htmlBody');

    if (!to) {
      return NextResponse.json({ success: false, error: 'Missing recipient: to' }, { status: 400 });
    }
    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 });
    }

    const config = await EmailConfigService.getActiveConfig();
    if (!config) {
      return NextResponse.json(
        { success: false, error: 'No email configuration found. Please create an active one first.' },
        { status: 404 }
      );
    }
    if (config.type !== 'graph') {
      return NextResponse.json(
        { success: false, error: 'Only Graph API is supported for this endpoint' },
        { status: 400 }
      );
    }

    const subject =
      subjectIn || (documentNumber ? `Document ${documentNumber}` : 'Message');
    const bodyText =
      textBody ||
      (documentNumber
        ? `Please find the attached document (${documentNumber}) where applicable.`
        : '');

    const fileEntry = form.get('attachment');
    let attachments: { name: string; contentType: string; contentBytes: string }[] | undefined;

    if (isFileLike(fileEntry) && fileEntry.size > 0) {
      const buffer = Buffer.from(await fileEntry.arrayBuffer());
      const name =
        fileEntry.name && fileEntry.name.toLowerCase().endsWith('.pdf')
          ? fileEntry.name
          : `${documentNumber || 'document'}.pdf`;
      attachments = [
        {
          name,
          contentType: 'application/pdf',
          contentBytes: buffer.toString('base64'),
        },
      ];
    }

    try {
      await GraphMailService.sendMail(config, {
        to,
        subject,
        body: htmlBody ? undefined : bodyText,
        htmlBody: htmlBody || undefined,
        attachments,
      });

      await prisma.email.create({
        data: {
          to,
          subject,
          body: bodyText,
          htmlBody: htmlBody || null,
          status: 'sent',
          errorMessage: null,
          emailConfigId: config.id,
        },
      });

      return NextResponse.json({ success: true, documentNumber: documentNumber || undefined });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await prisma.email.create({
        data: {
          to,
          subject,
          body: bodyText,
          htmlBody: htmlBody || null,
          status: 'failed',
          errorMessage: message,
          emailConfigId: config.id,
        },
      });
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to send';
    console.error('[bulk-local-send]', e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
