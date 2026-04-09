import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

async function requireAdmin() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  const session = await getSession(sessionToken);
  if (!session || session.role !== 'admin') return null;
  return session;
}

// GET /api/users — list all users (admin only)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const users = await prisma.user.findMany({
    select: { id: true, username: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ users });
}

// POST /api/users — create new user (admin only)
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await request.json();
  const { username, password, name, email, role } = body;

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }

  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
  });
  if (existing) {
    return NextResponse.json({ error: 'Username or email already exists' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
      name: name || null,
      email: email || null,
      role: role === 'admin' ? 'admin' : 'user',
    },
    select: { id: true, username: true, name: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
