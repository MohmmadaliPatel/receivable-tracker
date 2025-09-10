'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useState } from 'react';

export default function AuthButton() {
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [showDemoLogin, setShowDemoLogin] = useState(false);
  const [demoCredentials, setDemoCredentials] = useState({
    email: 'demo@example.com',
    password: 'demo123'
  });

  const handleAzureSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn('azure-ad', { callbackUrl: '/' });
    } catch (error) {
      console.error('Sign in error:', error);
    }
    setIsLoading(false);
  };

  const handleDemoSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn('demo', {
        email: demoCredentials.email,
        password: demoCredentials.password,
        callbackUrl: '/'
      });
    } catch (error) {
      console.error('Demo sign in error:', error);
    }
    setIsLoading(false);
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut({ callbackUrl: '/' });
    } catch (error) {
      console.error('Sign out error:', error);
    }
    setIsLoading(false);
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center space-x-3 px-4 py-2 bg-gray-50 rounded-xl">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
        <span className="text-sm text-gray-600 font-medium">Loading...</span>
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3 px-4 py-2 bg-gray-50 rounded-xl">
          <div className="relative">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt="Profile"
                className="w-9 h-9 rounded-full ring-2 ring-white shadow-md"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center text-white font-semibold text-sm shadow-md">
                {(session.user.name || session.user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full ring-2 ring-white"></div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900">
              {session.user.name || 'User'}
            </span>
            <span className="text-xs text-gray-500">
              {session.user.email}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
          {isLoading ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Signing out...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign out</span>
            </div>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4">
      <button
        onClick={handleAzureSignIn}
        disabled={isLoading}
        className="group px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
      >
        {isLoading ? (
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            <span>Signing in...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-3">
            
            <span>Sign in with Microsoft</span>
          </div>
        )}
      </button>
    </div>
  );
}
