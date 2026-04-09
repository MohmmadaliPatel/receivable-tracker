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

// PATCH /api/users/[id] — update user (admin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { name, email, role, password } = body;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Prevent demoting yourself
  if (id === admin.userId && role && role !== 'admin') {
    return NextResponse.json({ error: 'Cannot remove your own admin role' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name || null;
  if (email !== undefined) data.email = email || null;
  if (role !== undefined) data.role = role === 'admin' ? 'admin' : 'user';
  if (password && password.length >= 4) {
    data.password = await bcrypt.hash(password, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, name: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json({ user });
}

// DELETE /api/users/[id] — delete user (admin only)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;

  if (id === admin.userId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
