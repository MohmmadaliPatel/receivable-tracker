import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import RecipientTrackingDashboard from "@/components/RecipientTrackingDashboard";
import { getSession } from '@/lib/simple-auth';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

export default async function SendersPage() {
  const user = await getUser();

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar user={user || undefined} />
        <div className="flex-1">
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Senders</h1>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <RecipientTrackingDashboard />
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}


