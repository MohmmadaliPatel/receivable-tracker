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
  // Get all email configurations for a user
  static async getConfigsByUserId(userId: string) {
    return prisma.emailConfig.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get active email configuration for a user
  static async getActiveConfig(userId: string) {
    return prisma.emailConfig.findFirst({
      where: {
        userId,
        isActive: true,
      },
    });
  }

  // Get email configuration by ID
  static async getConfigById(id: string, userId: string) {
    return prisma.emailConfig.findFirst({
      where: {
        id,
        userId,
      },
    });
  }

  // Create new email configuration
  static async createConfig(userId: string, data: EmailConfigData) {
    // If this is set as active, deactivate other configs
    if (data.isActive !== false) {
      await prisma.emailConfig.updateMany({
        where: { userId },
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

  // Update email configuration
  static async updateConfig(id: string, userId: string, data: Partial<EmailConfigData>) {
    // If setting this as active, deactivate other configs
    if (data.isActive === true) {
      await prisma.emailConfig.updateMany({
        where: {
          userId,
          id: { not: id },
        },
        data: { isActive: false },
      });
    }

    // Build update data, filtering out undefined values
    const updateData: any = {};
    Object.keys(data).forEach((key) => {
      if (data[key as keyof EmailConfigData] !== undefined) {
        updateData[key] = data[key as keyof EmailConfigData];
      }
    });

    return prisma.emailConfig.update({
      where: {
        id,
        userId: userId, // Ensure user owns this config
      },
      data: updateData,
    });
  }

  // Delete email configuration
  static async deleteConfig(id: string, userId: string) {
    return prisma.emailConfig.delete({
      where: {
        id,
        userId: userId, // Ensure user owns this config
      },
    });
  }

  // Set active configuration
  static async setActiveConfig(id: string, userId: string) {
    // Deactivate all other configs
    await prisma.emailConfig.updateMany({
      where: {
        userId,
        id: { not: id },
      },
      data: { isActive: false },
    });

    // Activate this config
    return prisma.emailConfig.update({
      where: {
        id,
        userId,
      },
      data: { isActive: true },
    });
  }
}
