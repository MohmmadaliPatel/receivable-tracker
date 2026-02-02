import { prisma } from './prisma';

export class SenderService {
  // Get all senders for a user
  static async getSendersByUserId(userId: string) {
    return prisma.sender.findMany({
      where: { userId },
      include: {
        emailTrackings: {
          orderBy: { originalReceivedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get sender by ID
  static async getSenderById(id: string, userId: string) {
    return prisma.sender.findFirst({
      where: { id, userId },
      include: {
        emailTrackings: {
          orderBy: { originalReceivedAt: 'desc' },
        },
      },
    });
  }

  // Create sender
  static async createSender(userId: string, email: string, name?: string) {
    return prisma.sender.create({
      data: {
        email,
        name,
        userId,
      },
    });
  }

  // Update sender
  static async updateSender(id: string, userId: string, data: { name?: string; isActive?: boolean }) {
    return prisma.sender.update({
      where: {
        id,
        userId, // Ensure user owns this sender
      },
      data,
    });
  }

  // Delete sender
  static async deleteSender(id: string, userId: string) {
    return prisma.sender.delete({
      where: {
        id,
        userId,
      },
    });
  }
}


