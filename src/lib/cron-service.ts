import { prisma } from './prisma';
import { EmailConfigService } from './email-config-service';
import { SenderService } from './sender-service';
import { EmailTrackingService } from './email-tracking-service';
import { GraphMailService } from './graph-mail-service';
import { checkRepliesForConfirmations, getOrCreateSettings } from './confirmation-service';
import { runAgingCheckRepliesWithConfig } from './aging-check-replies';

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

      // Get all active senders for this user
      const senders = await SenderService.getSendersByUserId(config.userId);

      if (senders.length === 0) {
        console.log(`ℹ️  [Cron] No senders found for config ${configId}`);
        return;
      }

      console.log(`📧 [Cron] Processing ${senders.length} senders for config ${configId}`);

      // Sync emails for each sender
      for (const sender of senders) {
        if (!sender.isActive) {
          continue;
        }

        try {
          console.log(`📬 [Cron] Syncing emails for sender: ${sender.email}`);
          await EmailTrackingService.syncEmailsForSender(
            sender.email,
            sender.id,
            config,
            config.userId,
            50, // limit
            true // autoForward
          );

          // Check for replies to all forwarded emails
          await this.checkRepliesForAllForwardedEmails(config, config.userId);
        } catch (error) {
          console.error(`❌ [Cron] Error syncing sender ${sender.email}:`, error);
        }
      }

      // Check and send reminder emails if enabled
      if (config.reminderEnabled) {
        await this.checkAndSendReminders(config, config.userId);
      }

      // Check for confirmation replies if autoReplyCheck is enabled
      try {
        const settings = await getOrCreateSettings(config.userId);
        if (settings.autoReplyCheck) {
          console.log(`🔍 [Cron] Checking confirmation replies for user ${config.userId}`);
          const repliesFound = await checkRepliesForConfirmations();
          if (repliesFound > 0) {
            console.log(`✅ [Cron] Found ${repliesFound} new confirmation replies`);
          }
        }
      } catch (error) {
        console.error(`❌ [Cron] Error checking confirmation replies:`, error);
      }

      // Ageing: match customer replies to invoice chase threads (same config mailbox)
      try {
        const { checked, repliesFound } = await runAgingCheckRepliesWithConfig(
          config.userId,
          config
        );
        if (checked > 0) {
          console.log(
            `🔍 [Cron] Ageing reply check: ${checked} chases, ${repliesFound} new repl(ies)`
          );
        }
      } catch (error) {
        console.error(`❌ [Cron] Error checking ageing replies:`, error);
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

  // Check and send reminder emails for forwarded emails that meet the criteria
   async checkAndSendReminders(config: any, userId: string) {
    try {
      console.log(`🔔 [Cron] Checking for reminder emails for config ${config.id}`);

      // Get all forwarded emails for this config that haven't received replies and haven't had reminders sent
      const forwardedEmails = await prisma.emailTracking.findMany({
        where: {
          userId,
          emailConfigId: config.id,
          isForwarded: true,
          hasReplies: false,
          reminderSent: false,
          forwardedAt: {
            not: null,
          },
          forwardedTo: {
            not: null,
          },
        },
        include: {
          emailConfig: true,
        },
      });

      if (forwardedEmails.length === 0) {
        console.log(`ℹ️  [Cron] No emails need reminders`);
        return;
      }

      console.log(`📋 [Cron] Found ${forwardedEmails.length} forwarded emails to check for reminders`);

      const reminderDuration = config.reminderDurationHours || 24;
      const reminderUnit = config.reminderDurationUnit || 'hours';
      const reminderDurationMinutes = reminderUnit === 'hours' 
        ? reminderDuration * 60 
        : reminderDuration;

      let remindersSent = 0;

      for (const emailTracking of forwardedEmails) {
        if (!emailTracking.forwardedAt || !emailTracking.forwardedTo) {
          continue;
        }

        // Check if the duration has passed
        const forwardedDate = new Date(emailTracking.forwardedAt);
        const now = new Date();
        const minutesSinceForwarded = (now.getTime() - forwardedDate.getTime()) / (1000 * 60);

        if (minutesSinceForwarded >= reminderDurationMinutes) {
          try {
            console.log(`📧 [Cron] Sending reminder for email ${emailTracking.id} (${minutesSinceForwarded.toFixed(1)} minutes since forwarded)`);

            // Send reminder email to all forwarded-to addresses
            const forwardToEmails = emailTracking.forwardedTo.split(',').map(e => e.trim()).filter(e => e);
            const reminderSubject = 'Reminder';
            const reminderBody = `This is a reminder regarding the forwarded email:\n\nSubject: ${emailTracking.originalSubject || '(No Subject)'}\nFrom: ${emailTracking.originalFromName || emailTracking.originalFromEmail}\nOriginal Date: ${new Date(emailTracking.originalReceivedAt).toLocaleString()}\n\nPlease respond if you have any questions or concerns.`;

            for (const email of forwardToEmails) {
              await GraphMailService.sendMail(config, {
                to: email,
                subject: reminderSubject,
                body: reminderBody,
              });
            }

            // Update tracking to mark reminder sent
            try {
              await prisma.$executeRaw`
                UPDATE email_trackings 
                SET status = 'reminder_sent', 
                    reminderSent = 1, 
                    reminderSentAt = ${new Date()},
                    updatedAt = ${new Date()}
                WHERE id = ${emailTracking.id}
              `;
            } catch (error: any) {
              // Fallback: try with Prisma update (will work after Prisma regenerate)
              await prisma.emailTracking.update({
                where: { id: emailTracking.id },
                data: {
                  status: 'reminder_sent',
                  reminderSent: true,
                  reminderSentAt: new Date(),
                } as any,
              });
            }

            remindersSent++;
            console.log(`✅ [Cron] Reminder sent for email ${emailTracking.id}`);
          } catch (error) {
            console.error(`❌ [Cron] Error sending reminder for email ${emailTracking.id}:`, error);
          }
        }
      }

      if (remindersSent > 0) {
        console.log(`✅ [Cron] Sent ${remindersSent} reminder email(s)`);
      } else {
        console.log(`ℹ️  [Cron] No reminders were due at this time`);
      }
    } catch (error) {
      console.error('❌ [Cron] Error checking and sending reminders:', error);
    }
  }
}

// Singleton instance
export const cronService = new CronService();

