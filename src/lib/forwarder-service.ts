import { prisma } from './prisma';

export interface ForwarderData {
  email: string;
  name?: string;
  subject?: string;
  isActive?: boolean;
}

export class ForwarderService {
  // Get all forwarders for a user
  static async getForwardersByUserId(userId: string) {
    return prisma.forwarder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get forwarder by ID
  static async getForwarderById(id: string, userId: string) {
    return prisma.forwarder.findFirst({
      where: {
        id,
        userId,
      },
    });
  }

  // Create new forwarder
  static async createForwarder(userId: string, data: ForwarderData) {
    return prisma.forwarder.create({
      data: {
        ...data,
        userId,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  // Update forwarder
  static async updateForwarder(id: string, userId: string, data: Partial<ForwarderData>) {
    // First verify the forwarder belongs to the user
    const forwarder = await prisma.forwarder.findFirst({
      where: { id, userId },
    });

    if (!forwarder) {
      throw new Error('Forwarder not found or access denied');
    }

    return prisma.forwarder.update({
      where: { id },
      data,
    });
  }

  // Delete forwarder
  static async deleteForwarder(id: string, userId: string) {
    // First verify the forwarder belongs to the user
    const forwarder = await prisma.forwarder.findFirst({
      where: { id, userId },
    });

    if (!forwarder) {
      throw new Error('Forwarder not found or access denied');
    }

    return prisma.forwarder.delete({
      where: { id },
    });
  }
}

