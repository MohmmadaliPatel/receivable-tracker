import { prisma } from './prisma';

export class ForwardingRuleService {
  // Get forwarding rules for a sender (can be multiple)
  static async getRulesBySenderId(senderId: string, userId: string) {
    return prisma.forwardingRule.findMany({
      where: {
        senderId,
        userId,
      },
      include: {
        sender: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get a single forwarding rule by ID
  static async getRuleById(id: string, userId: string) {
    return prisma.forwardingRule.findFirst({
      where: {
        id,
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

  // Create a new forwarding rule (allows multiple rules per sender)
  static async createRule(
    senderId: string,
    userId: string,
    forwardToEmails: string,
    options: { isActive?: boolean; autoForward?: boolean; subjectFilter?: string } = {}
  ) {
    return prisma.forwardingRule.create({
      data: {
        senderId,
        userId,
        forwardToEmails,
        subjectFilter: options.subjectFilter || null,
        isActive: options.isActive !== undefined ? options.isActive : true,
        autoForward: options.autoForward !== undefined ? options.autoForward : true,
      },
    });
  }

  // Update an existing forwarding rule by ID
  static async updateRule(
    id: string,
    userId: string,
    data: {
      forwardToEmails?: string;
      subjectFilter?: string | null;
      isActive?: boolean;
      autoForward?: boolean;
    }
  ) {
    return prisma.forwardingRule.update({
      where: {
        id,
        userId, // Ensure user owns this rule
      },
      data,
    });
  }

  // Delete forwarding rule by ID
  static async deleteRule(id: string, userId: string) {
    return prisma.forwardingRule.delete({
      where: {
        id,
        userId, // Ensure user owns this rule
      },
    });
  }

  // Delete all forwarding rules for a sender
  static async deleteRulesBySenderId(senderId: string, userId: string) {
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
