import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { EmailConfigService } from '@/lib/email-config-service';
import { GraphMailService } from '@/lib/graph-mail-service';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

// Helper to get authenticated user
async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;

  if (!sessionToken) {
    return null;
  }

  return await getSession(sessionToken);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { to, subject, body: textBody, htmlBody, cc, bcc, configId } = body;

    // Validate required fields
    if (!to || !subject) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject' },
        { status: 400 }
      );
    }

    // Get active config for this user, or a specific config they own
    let config;
    if (configId) {
      config = await EmailConfigService.getConfigById(configId);
      if (!config || config.userId !== user.id) {
        return NextResponse.json(
          { error: 'Invalid or unauthorized email configuration.' },
          { status: 403 }
        );
      }
    } else {
      config = await EmailConfigService.getActiveConfigForUser(user.id);
    }

    if (!config) {
      return NextResponse.json(
        { error: 'No email configuration found. Please create an active one for your account first.' },
        { status: 404 }
      );
    }

    // Only support Graph API for now
    if (config.type !== 'graph') {
      return NextResponse.json(
        { error: 'Only Graph API is supported at this time' },
        { status: 400 }
      );
    }

    // Send email
    try {
      await GraphMailService.sendMail(config, {
        to,
        subject,
        body: textBody,
        htmlBody,
        cc,
        bcc,
      });

      // Save email record
      const emailRecord = await prisma.email.create({
        data: {
          to: Array.isArray(to) ? to.join(', ') : to,
          subject,
          body: textBody,
          htmlBody,
          status: 'sent',
          emailConfigId: config.id,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Email sent successfully',
        emailId: emailRecord.id,
      });
    } catch (error: any) {
      // Save failed email record
      await prisma.email.create({
        data: {
          to: Array.isArray(to) ? to.join(', ') : to,
          subject,
          body: textBody,
          htmlBody,
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
          emailConfigId: config.id,
        },
      });

      throw error;
    }
  } catch (error: any) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}
