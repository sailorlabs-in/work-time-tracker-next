"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { Session } from "next-auth";

export default function SessionProvider({ 
  children,
  session
}: { 
  children: ReactNode;
  session?: Session | null;
}) {
  return (
    <NextAuthSessionProvider 
      session={session} 
      refetchOnWindowFocus={false} 
      refetchWhenOffline={false}
    >
      {children}
    </NextAuthSessionProvider>
  );
}
