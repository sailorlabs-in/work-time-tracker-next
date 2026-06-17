import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [], // Empty array, populated in auth.ts
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = user.isAdmin;
        token.notificationsEnabled = user.notificationsEnabled;
        token.sessionVersion = (user as any).sessionVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isAdmin = token.isAdmin as boolean;
        session.user.notificationsEnabled = token.notificationsEnabled as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;
