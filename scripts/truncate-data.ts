import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function truncateData() {
  try {
    console.log('🗑️  [Truncate] Starting data truncation...');
    console.log('⚠️  This will delete all data except authentication records (users, sessions)');

    // Delete in order to respect foreign key constraints
    // 1. Delete EmailReply first (depends on EmailTracking)
    const deletedReplies = await prisma.emailReply.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedReplies.count} email replies`);

    // 2. Delete EmailTracking (depends on Sender and EmailConfig)
    const deletedTrackings = await prisma.emailTracking.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedTrackings.count} email trackings`);

    // 3. Delete ForwardingRule (depends on Sender)
    const deletedRules = await prisma.forwardingRule.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedRules.count} forwarding rules`);

    // 4. Delete Sender (depends on User)
    const deletedSenders = await prisma.sender.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedSenders.count} senders`);

    // 5. Delete Forwarder (depends on User)
    const deletedForwarders = await prisma.forwarder.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedForwarders.count} forwarders`);

    // 6. Delete EmailConfig (depends on User)
    const deletedConfigs = await prisma.emailConfig.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedConfigs.count} email configs`);

    // 7. Delete Email (standalone, no dependencies)
    const deletedEmails = await prisma.email.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedEmails.count} emails`);

    const summary = {
      emailReplies: deletedReplies.count,
      emailTrackings: deletedTrackings.count,
      forwardingRules: deletedRules.count,
      senders: deletedSenders.count,
      forwarders: deletedForwarders.count,
      emailConfigs: deletedConfigs.count,
      emails: deletedEmails.count,
    };

    console.log('✅ [Truncate] Data truncation completed!');
    console.log('📊 Summary:', summary);
    console.log('✅ Authentication records (users, sessions) were preserved');
  } catch (error: any) {
    console.error('❌ [Truncate] Error truncating data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

truncateData()
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


