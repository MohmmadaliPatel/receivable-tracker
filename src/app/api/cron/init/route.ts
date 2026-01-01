import { NextResponse } from 'next/server';
import { cronService } from '@/lib/cron-service';

// Initialize cron service on server startup
export async function GET() {
  try {
    cronService.start();
    return NextResponse.json({ success: true, message: 'Cron service initialized' });
  } catch (error) {
    console.error('Error initializing cron:', error);
    return NextResponse.json({ error: 'Failed to initialize cron' }, { status: 500 });
  }
}

