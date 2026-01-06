'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  user?: {
    username: string;
    name?: string;
  };
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  const menuItems = [
    {
      name: 'Dashboard',
      href: '/',
      icon: '📊',
    },
    {
      name: 'Senders',
      href: '/senders',
      icon: '👥',
    },
    {
      name: 'Forwarding Rules',
      href: '/forwarding-rules',
      icon: '📧',
    },
    {
      name: 'Forwarders',
      href: '/forwarders',
      icon: '📤',
    },
    {
      name: 'Forwarded Emails',
      href: '/forwarded-emails',
      icon: '📨',
    },
    {
      name: 'Email Configuration',
      href: '/email-config',
      icon: '⚙️',
    },
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href);
  };

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      {/* Logo/Header */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold">Email Auto</h1>
        {user && (
          <p className="text-sm text-gray-400 mt-1">
            {user.name || user.username}
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            Logout
          </button>
        </form>
        <p className="text-xs text-gray-500 text-center mt-3">
          Email Auto Manager v1.0
        </p>
      </div>
    </div>
  );
}
