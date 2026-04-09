'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  user?: {
    username: string;
    name?: string;
    role?: string;
  };
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const menuItems = [
    {
      name: 'Bulk Email',
      href: '/bulk-email',
      icon: '✉️',
    },
    {
      name: 'Email Configuration',
      href: '/email-config',
      icon: '⚙️',
    },
    {
      name: 'Documents',
      href: '/documents',
      icon: '🗂️',
    },
    {
      name: 'Reports',
      href: '/reports',
      icon: '📈',
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: '🔧',
    },
    ...(user?.role === 'admin' ? [{
      name: 'User Management',
      href: '/users',
      icon: '👥',
    }] : []),
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href);
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col shadow-sm">
      {/* Logo/Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="Taxteck" width={130} height={34} />
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

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-0.5">
          {menuItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 pt-3 border-t border-gray-100">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </form>
        <p className="text-[11px] text-gray-400 text-center mt-2">
          Taxteck v1.0
        </p>
      </div>
    </div>
  );
}
