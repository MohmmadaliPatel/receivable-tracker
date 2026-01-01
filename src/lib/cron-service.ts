import { prisma } from './prisma';
import { EmailConfigService } from './email-config-service';
import { RecipientService } from './recipient-service';
import { EmailTrackingService } from './email-tracking-service';

interface CronJob {
  intervalId: NodeJS.Timeout | null;
  configId: string;
}

class CronService {
  private jobs: Map<string, CronJob> = new Map();
  private isRunning = false;

  // Start cron service
  start() {
    if (this.isRunning) {
      console.log('⚠️ [Cron] Service already running');
      return;
    }

    this.isRunning = true;
    console.log('✅ [Cron] Service started');
    this.loadAndStartJobs();
  }

  // Stop cron service
  stop() {
    this.isRunning = false;
    this.jobs.forEach((job) => {
      if (job.intervalId) {
        clearInterval(job.intervalId);
      }
    });
    this.jobs.clear();
    console.log('🛑 [Cron] Service stopped');
  }

  // Load all active configs with cron enabled and start jobs
  async loadAndStartJobs() {
    try {
      const configs = await prisma.emailConfig.findMany({
        where: {
          isActive: true,
          cronEnabled: true,
        },
      });

      console.log(`📋 [Cron] Found ${configs.length} active configs with cron enabled`);

      for (const config of configs) {
        await this.startJobForConfig(config.id);
      }
    } catch (error) {
      console.error('❌ [Cron] Error loading jobs:', error);
    }
  }

  // Start a cron job for a specific config
  async startJobForConfig(configId: string) {
    try {
      // Stop existing job if any
      this.stopJobForConfig(configId);

      const config = await prisma.emailConfig.findUnique({
        where: { id: configId },
      });

      if (!config || !config.isActive || !config.cronEnabled) {
        console.log(`⏭️  [Cron] Config ${configId} is not active or cron disabled`);
        return;
      }

      const intervalMs = config.cronIntervalMinutes * 60 * 1000;
      console.log(`⏰ [Cron] Starting job for config ${configId} (${config.name}) - interval: ${config.cronIntervalMinutes} minutes`);

      const intervalId = setInterval(async () => {
        await this.runCronJob(configId);
      }, intervalMs);

      this.jobs.set(configId, {
        intervalId,
        configId,
      });

      // Run immediately on start
      await this.runCronJob(configId);
    } catch (error) {
      console.error(`❌ [Cron] Error starting job for config ${configId}:`, error);
    }
  }

  // Stop a cron job for a specific config
  stopJobForConfig(configId: string) {
    const job = this.jobs.get(configId);
    if (job && job.intervalId) {
      clearInterval(job.intervalId);
      this.jobs.delete(configId);
      console.log(`🛑 [Cron] Stopped job for config ${configId}`);
    }
  }

  // Run the cron job for a config
  async runCronJob(configId: string) {
    try {
      console.log(`🔄 [Cron] Running job for config ${configId} at ${new Date().toISOString()}`);
      
      const config = await prisma.emailConfig.findUnique({
        where: { id: configId },
      });

      if (!config || !config.isActive || !config.cronEnabled) {
        console.log(`⏭️  [Cron] Config ${configId} is not active or cron disabled, stopping job`);
        this.stopJobForConfig(configId);
        return;
      }

      // Get all active recipients for this user
      const recipients = await RecipientService.getRecipientsByUserId(config.userId);

      if (recipients.length === 0) {
        console.log(`ℹ️  [Cron] No recipients found for config ${configId}`);
        return;
      }

      console.log(`📧 [Cron] Processing ${recipients.length} recipients for config ${configId}`);

      // Sync emails for each recipient
      for (const recipient of recipients) {
        if (!recipient.isActive) {
          continue;
        }

        try {
          console.log(`📬 [Cron] Syncing emails for recipient: ${recipient.email}`);
          await EmailTrackingService.syncEmailsForRecipient(
            recipient.email,
            recipient.id,
            config,
            config.userId,
            50, // limit
            true // autoForward
          );

          // Check for replies to all forwarded emails
          await this.checkRepliesForAllForwardedEmails(config, config.userId);
        } catch (error) {
          console.error(`❌ [Cron] Error syncing recipient ${recipient.email}:`, error);
        }
      }

      console.log(`✅ [Cron] Completed job for config ${configId}`);
    } catch (error) {
      console.error(`❌ [Cron] Error running job for config ${configId}:`, error);
    }
  }

  // Check for replies to all forwarded emails
  async checkRepliesForAllForwardedEmails(config: any, userId: string) {
    try {
      const forwardedEmails = await prisma.emailTracking.findMany({
        where: {
          userId,
          emailConfigId: config.id,
          isForwarded: true,
          forwardMessageId: {
            not: null,
          },
        },
      });

      console.log(`💬 [Cron] Checking replies for ${forwardedEmails.length} forwarded emails`);

      for (const emailTracking of forwardedEmails) {
        if (emailTracking.forwardMessageId && emailTracking.forwardMessageId !== 'forwarded') {
          try {
            await EmailTrackingService.checkForReplies(
              emailTracking.id,
              config,
              emailTracking.forwardMessageId
            );
          } catch (error) {
            console.error(`❌ [Cron] Error checking replies for email ${emailTracking.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('❌ [Cron] Error checking replies:', error);
    }
  }
}

// Singleton instance
export const cronService = new CronService();

