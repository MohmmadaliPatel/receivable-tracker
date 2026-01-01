import { NextRequest, NextResponse } from 'next/server';
import { cronService } from '@/lib/cron-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, configId } = body;

    if (action === 'start') {
      if (configId) {
        await cronService.startJobForConfig(configId);
        return NextResponse.json({ success: true, message: 'Cron job started' });
      } else {
        cronService.start();
        return NextResponse.json({ success: true, message: 'Cron service started' });
      }
    } else if (action === 'stop') {
      if (configId) {
        cronService.stopJobForConfig(configId);
        return NextResponse.json({ success: true, message: 'Cron job stopped' });
      } else {
        cronService.stop();
        return NextResponse.json({ success: true, message: 'Cron service stopped' });
      }
    } else if (action === 'reload') {
      cronService.stop();
      await cronService.loadAndStartJobs();
      return NextResponse.json({ success: true, message: 'Cron jobs reloaded' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error managing cron:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

