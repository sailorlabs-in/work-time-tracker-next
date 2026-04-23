"use client";

import { useEffect } from "react";

/**
 * ServiceWorkerRegistrar
 *
 * Registers /sw.js on first mount. Placed in the root layout so it runs
 * on every page without causing SSR issues.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] Registered:", reg.scope);

        // Immediately check for updates on page load
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.error("[SW] Registration failed:", err);
      });
  }, []);

  // Renders nothing — purely side-effect
  return null;
}
