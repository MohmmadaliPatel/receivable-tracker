import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';

/**
 * Destructive: removes all application data while keeping `User` and `Session` tables intact.
 * Admin only. Use order that respects foreign keys.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "DELETE" }' },
        { status: 400 },
      );
    }

    const deleted: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
      const run = async (name: string, op: () => Promise<{ count: number }>) => {
        const { count } = await op();
        deleted[name] = count;
      };

      await run('emailReplies', () => tx.emailReply.deleteMany({}));
      await run('emailTrackings', () => tx.emailTracking.deleteMany({}));
      await run('emails', () => tx.email.deleteMany({}));
      await run('forwardingRules', () => tx.forwardingRule.deleteMany({}));
      await run('customerEmailEntries', () => tx.customerEmailEntry.deleteMany({}));
      await run('excludedCustomers', () => tx.excludedCustomer.deleteMany({}));
      await run('confirmationRecords', () => tx.confirmationRecord.deleteMany({}));
      await run('appSettings', () => tx.appSettings.deleteMany({}));
      // Ageing: import cascades to line items + per-import customer attachments
      await run('agingImports', () => tx.agingImport.deleteMany({}));
      await run('invoiceChases', () => tx.invoiceChase.deleteMany({}));
      await run('agingAttachmentRules', () => tx.agingAttachmentRule.deleteMany({}));
      await run('senders', () => tx.sender.deleteMany({}));
      await run('forwarders', () => tx.forwarder.deleteMany({}));
      await run('emailConfigs', () => tx.emailConfig.deleteMany({}));
    });

    return NextResponse.json({
      success: true,
      message: 'All application data removed. User accounts and login sessions are unchanged.',
      deleted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to clear data';
    console.error('[settings/clear-all-data]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
