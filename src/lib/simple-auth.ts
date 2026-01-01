import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SessionData {
  userId: string;
  username: string;
  name?: string;
}

// Create a session token
export async function createSession(userId: string): Promise<string> {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expires,
    },
  });

  return sessionToken;
}

// Get session data
export async function getSession(sessionToken: string): Promise<SessionData | null> {
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });

  if (!session || session.expires < new Date()) {
    // Session expired or doesn't exist
    if (session) {
      await prisma.session.delete({ where: { sessionToken } });
    }
    return null;
  }

  return {
    userId: session.userId,
    username: session.user.username,
    name: session.user.name || undefined,
  };
}

// Delete session
export async function deleteSession(sessionToken: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { sessionToken },
  });
}

// Verify login credentials
export async function verifyCredentials(
  credentials: LoginCredentials
): Promise<{ success: boolean; userId?: string }> {
  const user = await prisma.user.findUnique({
    where: { username: credentials.username },
  });

  if (!user) {
    return { success: false };
  }

  const isValid = await bcrypt.compare(credentials.password, user.password);

  if (!isValid) {
    return { success: false };
  }

  return { success: true, userId: user.id };
}

// Clean up expired sessions (can be called periodically)
export async function cleanupExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({
    where: {
      expires: {
        lt: new Date(),
      },
    },
  });
}
