import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/simple-auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;

    if (sessionToken) {
      await deleteSession(sessionToken);
    }

    // Clear session cookie and redirect to login page
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('session_token');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    // Even on error, redirect to login page
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('session_token');
    return response;
  }
}
