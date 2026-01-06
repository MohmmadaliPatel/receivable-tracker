import { prisma } from './prisma';

export class ForwardingRuleService {
  // Get forwarding rule for a sender
  static async getRuleBySenderId(senderId: string, userId: string) {
    return prisma.forwardingRule.findFirst({
      where: {
        senderId,
        userId,
      },
      include: {
        sender: true,
      },
    });
  }

  // Get all forwarding rules for a user
  static async getRulesByUserId(userId: string) {
    return prisma.forwardingRule.findMany({
      where: { userId },
      include: {
        sender: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Create or update forwarding rule
  static async upsertRule(
    senderId: string,
    userId: string,
    forwardToEmails: string,
    options: { isActive?: boolean; autoForward?: boolean; subjectFilter?: string } = {}
  ) {
    return prisma.forwardingRule.upsert({
      where: {
        senderId,
      },
      update: {
        forwardToEmails,
        subjectFilter: options.subjectFilter !== undefined ? options.subjectFilter : undefined,
        isActive: options.isActive !== undefined ? options.isActive : true,
        autoForward: options.autoForward !== undefined ? options.autoForward : true,
      },
      create: {
        senderId,
        userId,
        forwardToEmails,
        subjectFilter: options.subjectFilter || null,
        isActive: options.isActive !== undefined ? options.isActive : true,
        autoForward: options.autoForward !== undefined ? options.autoForward : true,
      },
    });
  }

  // Delete forwarding rule
  static async deleteRule(senderId: string, userId: string) {
    return prisma.forwardingRule.deleteMany({
      where: {
        senderId,
        userId,
      },
    });
  }

  // Get active forwarding rules for auto-forwarding
  static async getActiveRules(userId: string) {
    return prisma.forwardingRule.findMany({
      where: {
        userId,
        isActive: true,
        autoForward: true,
      },
      include: {
        sender: true,
      },
    });
  }
}
