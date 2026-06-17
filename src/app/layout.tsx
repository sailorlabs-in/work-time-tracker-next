import type { Metadata } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import SessionProvider from "@/components/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { auth } from "@/lib/auth";
import "./globals.scss";
import Navbar from "@/components/Navbar";
import NotificationBanner from "@/components/NotificationBanner";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WorkTracker — Time Tracking Made Beautiful",
  description:
    "Track your work hours, breaks, and productivity with a beautiful calendar view. Punch in, punch out, and see your progress.",
};

// Inline script to set data-theme BEFORE React hydrates — prevents flash of wrong theme
const themeScript = `
(function() {
  try {
    var saved = localStorage.getItem('wtt-theme');
    var theme = (saved === 'light' || saved === 'dark') ? saved
      : (saved === 'system' || !saved)
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch(e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${poppins.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Synchronously sets data-theme before first paint — no flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* PWA manifest + meta */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <SessionProvider session={session}>
          <ThemeProvider>
            <div className="app-shell">
              <ServiceWorkerRegistrar />
              <Navbar />
              <NotificationBanner />
              {children}
            </div>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
