"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { vibeClient, getStoredUserEmail } from "@/lib/vibe-client";

/**
 * ServiceWorkerRegistrar
 *
 * Registers /sw.js on first mount and re-registers push notifications
 * if the user was previously registered (stored in localStorage).
 */
export default function ServiceWorkerRegistrar() {
  const { data: session } = useSession();

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

  // Re-register push notifications if user is logged in and was previously registered
  useEffect(() => {
    if (!session?.user?.email) return;

    const storedEmail = getStoredUserEmail();
    const currentEmail = session.user.email;

    // If there's a stored email, ensure the device is registered
    if (storedEmail || currentEmail) {
      const emailToRegister = storedEmail || currentEmail;

      (async () => {
        try {
          if (vibeClient) {
            console.log(
              "[VAPID] Re-registering device for:",
              emailToRegister
            );
            await vibeClient.registerDevice({
              externalUserId: emailToRegister,
            });
          }
        } catch (err) {
          console.error(
            "[VAPID] Failed to re-register push notifications:",
            err
          );
        }
      })();
    }
  }, [session?.user?.email]);

  // Renders nothing — purely side-effect
  return null;
}
