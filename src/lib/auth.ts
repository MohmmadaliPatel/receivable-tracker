import { NextAuthOptions } from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "./prisma"

// Utility function to refresh access token
export async function refreshAccessToken(refreshToken: string) {
  try {
    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      method: "POST",
    })

    const tokens = await response.json()

    if (!response.ok) throw tokens

    return {
      accessToken: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000 + tokens.expires_in),
      refreshToken: tokens.refresh_token ?? refreshToken,
    }
  } catch (error) {
    console.error("Error refreshing access token", error)
    throw error
  }
}

// Demo mode provider for testing without Azure AD setup
const DemoProvider = CredentialsProvider({
  name: "demo",
  credentials: {
    email: { label: "Email", type: "email", placeholder: "demo@example.com" },
    password: { label: "Password", type: "password", placeholder: "demo123" }
  },
  async authorize(credentials) {
    // Demo authentication - accept any email/password combination
    if (credentials?.email && credentials?.password) {
      return {
        id: "demo-user-1",
        email: credentials.email,
        name: "Demo User",
        image: "https://via.placeholder.com/32x32?text=DU"
      }
    }
    return null
  }
})

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    // Demo provider for testing without Azure AD
    ...(process.env.DEMO_MODE === 'true' ? [DemoProvider] : []),

    // Azure AD provider (only if credentials are provided)
    ...(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET ? [
      AzureADProvider({
        clientId: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        tenantId: "common", // Use "common" for multi-tenant (any Microsoft account)
        authorization: {
          params: {
            scope: "openid profile email https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read"
          }
        }
      })
    ] : []),
  ],
  callbacks: {
    async session({ session, token, user, }) {
      console.log("SESSION", session);
      console.log("TOKEN", token);
      console.log("USER", user);

      if (session?.user) {
        // Get user ID from token, user object, or fallback to empty string
        if (token?.sub) {
          session.user.id = token.sub;
        } else if (token?.id) {
          session.user.id = token.id as string;
        } else if (user?.id) {
          session.user.id = user.id;
        } else {
          // For database sessions, we need to fetch the user ID from the database
          // This is a fallback that should work with PrismaAdapter
          session.user.id = session.user.email || "";
        }
      }

      // Add access token to session (only if available and token exists)
      if (token && token.accessToken) {
        session.accessToken = token.accessToken as string
      }
      return session
    },
    async jwt({ token, account, user }) {
      console.log("JWT Callback - TOKEN:", token);
      console.log("JWT Callback - ACCOUNT:", account);
      console.log("JWT Callback - USER:", user);

      // Initial sign in - account will be present
      if (account) {
        console.log("Initial sign in detected");
        token.accessToken = (account.access_token || account.accessToken) as string;
        token.refreshToken = (account.refresh_token || account.refreshToken) as string;
        token.expiresAt = (account.expires_at || account.expiresAt) as number;

        // Set user ID for session
        if (user?.id) {
          token.id = user.id;
        } else if (account.providerAccountId) {
          token.id = account.providerAccountId;
        }

        console.log("Token after initial setup:", token);
        return token;
      }

      // For subsequent calls, preserve the token data
      console.log("Subsequent JWT call, preserving token:", token);
      return token;
    },
  },
  session: {
    strategy: "database",
  },
}