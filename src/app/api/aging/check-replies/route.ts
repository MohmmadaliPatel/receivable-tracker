import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAgingCheckRepliesWithConfig } from '@/lib/aging-check-replies';
import { getCurrentUser } from '@/lib/simple-auth';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const emailConfig = await prisma.emailConfig.findFirst({
      where: { userId: user.id, isActive: true },
    });

    if (!emailConfig) {
      return NextResponse.json(
        { error: 'No active email configuration found.' },
        { status: 400 }
      );
    }

    const { checked, repliesFound } = await runAgingCheckRepliesWithConfig(user.id, emailConfig);

    if (checked === 0) {
      return NextResponse.json({
        checked: 0,
        repliesFound: 0,
        message: 'No outstanding emails to check',
      });
    }

    return NextResponse.json({
      checked,
      repliesFound,
    });
  } catch (error) {
    console.error('[Check Replies] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to check replies';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
