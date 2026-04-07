import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import { EmailConfigService } from '@/lib/email-config-service';
import { GraphMailService } from '@/lib/graph-mail-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// GET /api/confirmations/[id]/response-attachment?attachmentId=xxx
// Proxies the attachment bytes from Graph API so the browser can download it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const attachmentId = request.nextUrl.searchParams.get('attachmentId');
  if (!attachmentId) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 });

  const record = await prisma.confirmationRecord.findFirst({
    where: { id, userId: user.userId },
  });
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!record.responseMessageId) return NextResponse.json({ error: 'No response message recorded' }, { status: 404 });

  const config = record.emailConfigId
    ? await EmailConfigService.getConfigById(record.emailConfigId, user.userId)
    : await EmailConfigService.getActiveConfig(user.userId);
  if (!config) return NextResponse.json({ error: 'No email config' }, { status: 500 });

  try {
    const accessToken = await GraphMailService.getAccessToken(config);

    // Fetch the attachment including its content bytes
    const attRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.fromEmail)}/messages/${record.responseMessageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!attRes.ok) {
      const errBody = await attRes.text();
      return NextResponse.json({ error: `Graph error: ${errBody}` }, { status: attRes.status });
    }

    const attData = await attRes.json();
    const contentBytes: string = attData.contentBytes; // base64
    const contentType: string = attData.contentType || 'application/octet-stream';
    const name: string = attData.name || 'attachment';

    const buffer = Buffer.from(contentBytes, 'base64');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch attachment' }, { status: 500 });
  }
}
