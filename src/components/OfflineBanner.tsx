"use client";

import { useEffect, useState, useRef } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getPendingCount, flush } from "@/lib/offlineQueue";
import { RiWifiOffLine, RiRefreshLine, RiCheckLine } from "@remixicon/react";

type SyncState = "idle" | "syncing" | "synced";

export default function OfflineBanner() {
  const { isOnline, isServerReachable } = useOnlineStatus();
  const isOffline = !isOnline || !isServerReachable;

  const [pendingCount, setPendingCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wasOfflineRef = useRef(false);

  // Update pending count periodically while offline
  useEffect(() => {
    if (isOffline) {
      setPendingCount(getPendingCount());
      const iv = setInterval(() => setPendingCount(getPendingCount()), 3000);
      return () => clearInterval(iv);
    }
  }, [isOffline]);

  // Show / hide banner
  useEffect(() => {
    if (isOffline) {
      wasOfflineRef.current = true;
      setVisible(true);
      setSyncState("idle");
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else if (wasOfflineRef.current) {
      // Just came back online — flush queue
      wasOfflineRef.current = false;
      setSyncState("syncing");
      setVisible(true);

      flush((remaining) => setPendingCount(remaining)).then(() => {
        setPendingCount(getPendingCount());
        setSyncState("synced");
        hideTimerRef.current = setTimeout(() => {
          setVisible(false);
          setSyncState("idle");
        }, 3000);
      });
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isOffline]);

  if (!visible) return null;

  return (
    <div
      className={`offline-banner offline-banner--${
        syncState === "synced" ? "synced" : isOffline ? "offline" : "syncing"
      }`}
      role="status"
      aria-live="polite"
    >
      <span className="offline-banner__icon">
        {syncState === "syncing" ? (
          <RiRefreshLine size={16} className="offline-banner__spin" />
        ) : syncState === "synced" ? (
          <RiCheckLine size={16} />
        ) : (
          <RiWifiOffLine size={16} />
        )}
      </span>

      <span className="offline-banner__text">
        {syncState === "syncing" && "Syncing your data…"}
        {syncState === "synced" && "All synced ✓"}
        {syncState === "idle" && (
          <>
            {!isOnline ? "No internet connection" : "Server unreachable"}
            {pendingCount > 0 && (
              <span className="offline-banner__badge">
                {pendingCount} action{pendingCount !== 1 ? "s" : ""} pending
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}
