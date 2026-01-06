import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import ForwardersManager from "@/components/ForwardersManager";
import { getSession } from '@/lib/simple-auth';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

export default async function ForwardersPage() {
  const user = await getUser();

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar user={user || undefined} />
        <div className="flex-1">
          <ForwardersManager />
        </div>
      </div>
    </AuthGuard>
  );
}

