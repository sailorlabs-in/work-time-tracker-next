"use client";

import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";
import { ReactNode, useEffect } from "react";
import { Session } from "next-auth";

function AuthRedirectHandler() {
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      const publicPaths = ["/login", "/register", "/"];
      if (typeof window !== "undefined" && !publicPaths.includes(window.location.pathname)) {
        window.location.href = "/login";
      }
    }
  }, [status]);

  return null;
}

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
      <AuthRedirectHandler />
      {children}
    </NextAuthSessionProvider>
  );
}
