export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { cronService } = await import('./lib/cron-service');
    
    // Start cron service on server startup
    console.log('🚀 [Instrumentation] Starting cron service...');
    cronService.start();
  }
}

