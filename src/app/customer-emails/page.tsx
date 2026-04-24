import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import CustomerEmailsClient from './CustomerEmailsClient';
import { getSession } from '@/lib/simple-auth';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

export default async function CustomerEmailsPage() {
  const user = await getUser();

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar user={user ? { username: user.username, name: user.name, role: user.role } : undefined} />
        <div className="flex-1 overflow-hidden">
          <CustomerEmailsClient />
        </div>
      </div>
    </AuthGuard>
  );
}
