'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogosRow } from '@/components/BrandLogosRow';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Mails,
  FileText,
  IdCard,
  UserX,
  Inbox,
  Paperclip,
  Cog,
  Settings,
  Users,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  user?: {
    username: string;
    name?: string;
    role?: string;
  };
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const menuItems: { name: string; href: string; Icon: LucideIcon }[] = [
    { name: 'Dashboard', href: '/', Icon: LayoutDashboard },
    { name: 'Bulk Email', href: '/bulk-email', Icon: Mails },
    { name: 'Attachments', href: '/aging-attachments', Icon: Paperclip },
    { name: 'Invoices', href: '/invoices', Icon: FileText },
    { name: 'Customer emails', href: '/customer-emails', Icon: IdCard },
    { name: 'Excluded customers', href: '/excluded-customers', Icon: UserX },
    { name: 'Ageing snapshots', href: '/ageing-snapshots', Icon: Inbox },
    { name: 'Email Configuration', href: '/email-config', Icon: Cog },
    { name: 'Settings', href: '/settings', Icon: Settings },
    ...(user?.role === 'admin' ? [{ name: 'User Management', href: '/users', Icon: Users }] : []),
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href);
  };

  return (
    <aside
      className="w-64 shrink-0 bg-white border-r border-gray-200 shadow-sm flex flex-col h-screen max-h-screen sticky top-0 z-30"
      aria-label="Main navigation"
    >
      {/* Logo/Header — shrink-0 so nav+footer get remaining height */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <Link href="/" className="block w-full min-w-0">
          <div className="w-full min-w-0">
            <BrandLogosRow variant="sidebar" />
          </div>
        </Link>
        {user && (
          <div className="mt-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-blue-700">
                {(user.name || user.username).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{user.name || user.username}</p>
              {user.role === 'admin' && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                  Admin
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation — scrolls if many items; keeps logout visible */}
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3">
        <ul className="space-y-0.5">
          {menuItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-slate-800 text-white font-medium shadow-sm'
                    : 'text-gray-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <item.Icon
                  className={`w-4 h-4 shrink-0 ${isActive(item.href) ? 'text-white' : 'text-gray-500'}`}
                  aria-hidden
                />
                <span className="font-medium">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer — always at bottom of viewport */}
      <div className="shrink-0 px-3 pb-4 pt-3 border-t border-gray-100 bg-white">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-gray-800 bg-gray-100 hover:bg-red-50 hover:text-red-700 border border-gray-200 rounded-xl transition-colors font-medium"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Logout
          </button>
        </form>
        <p className="text-[11px] text-gray-400 text-center mt-2">Receivable Tracker</p>
      </div>
    </aside>
  );
}
