import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { generateEmailHtml } from '@/lib/confirmation-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// POST /api/confirmations/preview — generate email HTML preview per category
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { categories } = await request.json();
  if (!Array.isArray(categories)) {
    return NextResponse.json({ error: 'categories array required' }, { status: 400 });
  }

  const sampleEntity = 'Sample Entity Pvt Ltd';
  const previews: Record<string, string> = {};
  for (const cat of categories) {
    previews[cat] = generateEmailHtml(sampleEntity, cat);
  }

  return NextResponse.json({ previews });
}
