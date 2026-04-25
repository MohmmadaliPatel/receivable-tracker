import { prisma } from './prisma';

export interface EmailConfigData {
  name: string;
  type: 'graph' | 'smtp';
  msTenantId: string;
  msClientId: string;
  msClientSecret: string;
  fromEmail: string;
  isActive?: boolean;
  cronEnabled?: boolean;
  cronIntervalMinutes?: number;
  reminderEnabled?: boolean;
  reminderDurationHours?: number;
  reminderDurationUnit?: string;
}

export class EmailConfigService {
  /** All configurations — shared across users (everyone can view). */
  static async getAllConfigs() {
    return prisma.emailConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /** @deprecated Use getAllConfigs — kept for call sites that still pass userId */
  static async getConfigsByUserId(_userId: string) {
    return this.getAllConfigs();
  }

  /** Active mailbox for sending / reply check (single global active config). */
  static async getActiveConfig() {
    return prisma.emailConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Active mailbox for the given user (for send + email log rows scoped to that user). */
  static async getActiveConfigForUser(userId: string) {
    return prisma.emailConfig.findFirst({
      where: { userId, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  static async getConfigById(id: string) {
    return prisma.emailConfig.findFirst({
      where: { id },
    });
  }

  static async createConfig(userId: string, data: EmailConfigData) {
    if (data.isActive !== false) {
      await prisma.emailConfig.updateMany({
        data: { isActive: false },
      });
    }

    return prisma.emailConfig.create({
      data: {
        ...data,
        userId,
        isActive: data.isActive !== false,
      },
    });
  }

  static async updateConfig(id: string, data: Partial<EmailConfigData>) {
    if (data.isActive === true) {
      await prisma.emailConfig.updateMany({
        where: { id: { not: id } },
        data: { isActive: false },
      });
    }

    const updateData: Record<string, unknown> = {};
    Object.keys(data).forEach((key) => {
      const v = data[key as keyof EmailConfigData];
      if (v !== undefined) updateData[key] = v;
    });

    return prisma.emailConfig.update({
      where: { id },
      data: updateData as Record<string, unknown>,
    });
  }

  static async deleteConfig(id: string) {
    return prisma.emailConfig.delete({
      where: { id },
    });
  }

  static async setActiveConfig(id: string) {
    await prisma.emailConfig.updateMany({
      where: { id: { not: id } },
      data: { isActive: false },
    });

    return prisma.emailConfig.update({
      where: { id },
      data: { isActive: true },
    });
  }
}
