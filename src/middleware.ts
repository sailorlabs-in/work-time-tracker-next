import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Public routes — never require authentication
  const publicRoutes = ["/login", "/register", "/api/auth", "/api/health", "/api/cron"];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route),
  );

  if (!isAuthenticated && !isPublicRoute && pathname !== "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Exclude: Next.js internals, static files, AND PWA assets (sw.js, manifest.json, icons/)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|icons/).*)",
  ],
};
