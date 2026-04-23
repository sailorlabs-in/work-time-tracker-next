"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface OnlineStatus {
  isOnline: boolean;
  isServerReachable: boolean;
}

const HEALTH_PING_MS = 30_000; // 30 seconds
const HEALTH_URL = "/api/health";

/**
 * useOnlineStatus
 *
 * Tracks real connectivity by combining two signals:
 *  1. browser navigator.onLine + online/offline events
 *  2. periodic lightweight ping to /api/health (server-reachable check)
 *
 * Returns { isOnline, isServerReachable }
 *  - isOnline: false  → no network at all
 *  - isServerReachable: false → network up but server is down
 */
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isServerReachable, setIsServerReachable] = useState(true);
  const pingRef = useRef<NodeJS.Timeout | null>(null);

  const pingServer = useCallback(async () => {
    // If browser says offline, skip the ping immediately
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsServerReachable(false);
      return;
    }
    try {
      const res = await fetch(HEALTH_URL, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(5000), // 5s timeout
      });
      setIsServerReachable(res.ok);
    } catch {
      setIsServerReachable(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Immediately ping server when browser says we're back
      pingServer();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsServerReachable(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial ping on mount
    pingServer();

    // Periodic health-check
    pingRef.current = setInterval(pingServer, HEALTH_PING_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [pingServer]);

  return { isOnline, isServerReachable };
}
