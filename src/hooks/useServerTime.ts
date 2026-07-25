"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook that fetches server time on mount and calculates a time offset
 * so that all timer operations use the server's clock instead of the
 * client's potentially tampered system clock.
 *
 * Re-syncs every 30 minutes to account for clock drift.
 */

const RESYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

interface ServerTimeState {
  offset: number; // serverTime - clientTime
  isSynced: boolean;
  lastSyncAt: number | null;
  error: string | null;
}

async function fetchServerTime(): Promise<{ offset: number; latency: number }> {
  const clientBefore = Date.now();
  const res = await fetch("/api/server-time");
  const clientAfter = Date.now();

  if (!res.ok) {
    throw new Error(`Server time fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const serverTime = data.serverTime as number;

  // Estimate one-way latency as half the round-trip
  const roundTrip = clientAfter - clientBefore;
  const estimatedLatency = Math.floor(roundTrip / 2);

  // The server timestamp was captured somewhere between clientBefore and clientAfter.
  // Best estimate of client time at the moment server generated the timestamp:
  const clientAtServerTime = clientBefore + estimatedLatency;

  const offset = serverTime - clientAtServerTime;

  return { offset, latency: estimatedLatency };
}

export function useServerTime() {
  const [state, setState] = useState<ServerTimeState>({
    offset: 0,
    isSynced: false,
    lastSyncAt: null,
    error: null,
  });

  const offsetRef = useRef(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const sync = useCallback(async () => {
    try {
      const { offset } = await fetchServerTime();
      offsetRef.current = offset;
      setState({
        offset,
        isSynced: true,
        lastSyncAt: Date.now(),
        error: null,
      });
    } catch (err) {
      // On failure, keep using previous offset (or 0 if never synced)
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Sync failed",
      }));
    }
  }, []);

  // Initial sync on mount + periodic re-sync
  useEffect(() => {
    sync();

    syncIntervalRef.current = setInterval(() => {
      sync();
    }, RESYNC_INTERVAL_MS);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [sync]);

  /**
   * Returns the current time in milliseconds, adjusted by the server offset.
   * This is the replacement for `Date.now()` throughout the timer code.
   */
  const getServerNow = useCallback((): number => {
    return Date.now() + offsetRef.current;
  }, []);

  /**
   * Creates a Date object using server-adjusted time.
   */
  const getServerDate = useCallback((): Date => {
    return new Date(Date.now() + offsetRef.current);
  }, []);

  return {
    getServerNow,
    getServerDate,
    isSynced: state.isSynced,
    lastSyncAt: state.lastSyncAt,
    timeOffset: state.offset,
    syncError: state.error,
    resync: sync,
  };
}
