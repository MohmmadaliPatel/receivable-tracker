import { prisma } from './prisma';

export class RecipientService {
  // Get all recipients for a user
  static async getRecipientsByUserId(userId: string) {
    return prisma.recipient.findMany({
      where: { userId },
      include: {
        emailTrackings: {
          orderBy: { originalReceivedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get recipient by ID
  static async getRecipientById(id: string, userId: string) {
    return prisma.recipient.findFirst({
      where: { id, userId },
      include: {
        emailTrackings: {
          orderBy: { originalReceivedAt: 'desc' },
        },
      },
    });
  }

  // Create recipient
  static async createRecipient(userId: string, email: string, name?: string) {
    return prisma.recipient.create({
      data: {
        email,
        name,
        userId,
      },
    });
  }

  // Update recipient
  static async updateRecipient(id: string, userId: string, data: { name?: string; isActive?: boolean }) {
    return prisma.recipient.update({
      where: {
        id,
        userId, // Ensure user owns this recipient
      },
      data,
    });
  }

  // Delete recipient
  static async deleteRecipient(id: string, userId: string) {
    return prisma.recipient.delete({
      where: {
        id,
        userId,
      },
    });
  }
}
