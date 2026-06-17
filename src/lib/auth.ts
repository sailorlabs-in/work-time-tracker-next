import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.isAdmin,
          notificationsEnabled: user.notificationsEnabled,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      if (session.user && token.id) {
        // Fetch current user from database to check session version/status
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { sessionVersion: true, isAdmin: true, notificationsEnabled: true },
        });

        const tokenVersion = token.sessionVersion ?? 0;

        // If user no longer exists, or session version doesn't match
        if (!dbUser || dbUser.sessionVersion !== tokenVersion) {
          return {
            ...session,
            user: undefined as any,
          };
        }

        session.user.id = token.id as string;
        session.user.isAdmin = dbUser.isAdmin;
        session.user.notificationsEnabled = dbUser.notificationsEnabled;
      }
      return session;
    },
  },
});
