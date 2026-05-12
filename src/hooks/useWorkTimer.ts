"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as offlineQueue from "@/lib/offlineQueue";

const MS_PER_HOUR = 3600000;
const MS_PER_MINUTE = 60000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export type TimerStatus = "idle" | "working" | "break" | "completed";

export interface TimerLog {
  type: string;
  time: number;
}

export interface TimerState {
  isActive: boolean;
  startTime: number | null;
  targetWorkMs: number;
  targetBreakMs: number;
  accumulatedWorkMs: number;
  accumulatedBreakMs: number;
  lastStatusChange: number | null;
  status: TimerStatus;
  logs: TimerLog[];
  hasFiredOtNotification?: boolean;
}

const defaultState: TimerState = {
  isActive: false,
  startTime: null,
  targetWorkMs: 0,
  targetBreakMs: 0,
  accumulatedWorkMs: 0,
  accumulatedBreakMs: 0,
  lastStatusChange: null,
  status: "idle",
  logs: [],
  hasFiredOtNotification: false,
};

export function formatTime(ms: number): string {
  const absMs = Math.abs(ms);
  const totalSeconds = Math.floor(absMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatShortTime(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

// ── Session Builder ──────────────────────────────────────────────────────────

export interface SessionRow {
  punchIn: number;
  punchOut: number | null;
  inLogIndex: number;
  outLogIndex: number | null;
}

export function buildSessionRows(logs: TimerLog[], status: TimerStatus): SessionRow[] {
  const sortedWithIndex = logs
    .map((log, index) => ({ ...log, originalIndex: index }))
    .sort((a, b) => a.time - b.time);

  const rows: SessionRow[] = [];
  let currentIn: { time: number; originalIndex: number } | null = null;

  for (const log of sortedWithIndex) {
    if (log.type === "Start" || log.type === "Punch In (Work)") {
      currentIn = { time: log.time, originalIndex: log.originalIndex };
    } else if (log.type === "Punch Out (Break)" && currentIn !== null) {
      rows.push({
        punchIn: currentIn.time,
        punchOut: log.time,
        inLogIndex: currentIn.originalIndex,
        outLogIndex: log.originalIndex,
      });
      currentIn = null;
    }
  }

  if (status === "working" && currentIn !== null) {
    rows.push({
      punchIn: currentIn.time,
      punchOut: null,
      inLogIndex: currentIn.originalIndex,
      outLogIndex: null,
    });
  }

  return rows;
}

// ── Offline-aware backend helpers ─────────────────────────────────────────────

async function sendLogToBackend(
  type: "punch-in" | "punch-out",
  time: string,
  totalHours?: string,
) {
  const body = {
    type,
    time,
    date: new Date().toISOString().split("T")[0],
    totalHours,
  };
  try {
    await fetch("/api/worklog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Offline — queue for later
    offlineQueue.enqueue("/api/worklog", "POST", body);
  }
}

async function syncTimerStateToBackend(state: TimerState) {
  try {
    await fetch("/api/timer-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  } catch {
    // Offline — queue (deduped: only keeps the latest timer-sync)
    offlineQueue.enqueue("/api/timer-sync", "POST", state as unknown as object);
  }
}

async function loadTimerStateFromBackend(): Promise<TimerState | null> {
  try {
    const res = await fetch("/api/timer-sync");
    if (res.ok) {
      const data = await res.json();
      if (data && data.isActive) {
        return {
          isActive: data.isActive,
          startTime: data.startTime,
          targetWorkMs: data.targetWorkMs,
          targetBreakMs: data.targetBreakMs,
          accumulatedWorkMs: data.accumulatedWorkMs,
          accumulatedBreakMs: data.accumulatedBreakMs,
          lastStatusChange: data.lastStatusChange,
          status: data.status as TimerStatus,
          logs: Array.isArray(data.logs) ? data.logs : [],
          hasFiredOtNotification: data.hasFiredOtNotification || false,
        };
      }
    }
  } catch {
    console.error("Failed to load timer state from backend (offline?)");
  }
  return null;
}

async function clearTimerStateFromBackend() {
  try {
    await fetch("/api/timer-sync", { method: "DELETE" });
  } catch {
    offlineQueue.enqueue("/api/timer-sync", "DELETE");
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorkTimer(initialState: TimerState | null = null) {
  const [state, setState] = useState<TimerState>(initialState || defaultState);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isLoaded, setIsLoaded] = useState(!!initialState);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load state: try backend first, then localStorage fallback
  useEffect(() => {
    if (initialState) return;
    async function loadState() {
      const backendState = await loadTimerStateFromBackend();
      if (backendState) {
        setState(backendState);
        localStorage.setItem("wtt_state_next", JSON.stringify(backendState));
      } else {
        const saved = localStorage.getItem("wtt_state_next");
        if (saved) {
          try {
            setState(JSON.parse(saved));
          } catch {
            // Invalid state — leave as default
          }
        }
      }
      setIsLoaded(true);
    }
    loadState();
  }, [initialState]);

  // Flush any pending offline queue on mount (handles close-while-offline scenario)
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      offlineQueue.flush().catch(() => {
        // Silently ignore — will retry on next reconnect
      });
    }
  }, []);

  // Save state to localStorage on change
  useEffect(() => {
    if (state.isActive) {
      localStorage.setItem("wtt_state_next", JSON.stringify(state));
    }
  }, [state]);

  // Timer interval (tick every second + overtime notification)
  useEffect(() => {
    if (state.isActive) {
      intervalRef.current = setInterval(() => {
        const nowMs = Date.now();
        setCurrentTime(nowMs);

        const currentWork =
          state.status === "working" && state.lastStatusChange
            ? nowMs - state.lastStatusChange
            : 0;
        const totalWorkNow = state.accumulatedWorkMs + currentWork;

        if (
          state.status === "working" &&
          !state.hasFiredOtNotification &&
          state.targetWorkMs > 0 &&
          totalWorkNow >= state.targetWorkMs
        ) {
          setState((prev) => ({ ...prev, hasFiredOtNotification: true }));
          // Best-effort: ignore failure (we don't queue notifications)
          fetch("/api/user/notify-overtime", { method: "POST" }).catch(() => {});
        }
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    state.isActive,
    state.status,
    state.lastStatusChange,
    state.accumulatedWorkMs,
    state.targetWorkMs,
    state.hasFiredOtNotification,
  ]);

  // Auto-sync every 5 minutes to PostgreSQL
  useEffect(() => {
    if (state.isActive) {
      syncTimerStateToBackend(state);
      setLastSynced(new Date());

      syncIntervalRef.current = setInterval(() => {
        syncTimerStateToBackend(state);
        setLastSynced(new Date());
      }, SYNC_INTERVAL_MS);
    }

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isActive, state.status, state.accumulatedWorkMs, state.accumulatedBreakMs]);

  // Computed values
  const now = currentTime;
  let currentSessionWork = 0;
  let currentSessionBreak = 0;

  if (state.status === "working" && state.lastStatusChange) {
    currentSessionWork = now - state.lastStatusChange;
  } else if (state.status === "break" && state.lastStatusChange) {
    currentSessionBreak = now - state.lastStatusChange;
  }

  const totalWork = state.accumulatedWorkMs + currentSessionWork;
  const totalBreak = state.accumulatedBreakMs + currentSessionBreak;
  const remainingWork = state.targetWorkMs - totalWork;
  const remainingBreak = state.targetBreakMs - totalBreak;
  const isOvertime = remainingWork <= 0;

  const startDay = useCallback(
    (
      workHours: number,
      workMinutes: number,
      breakMinutes: number,
      entryTimeStr: string,
    ) => {
      const totalWorkHours = workHours + workMinutes / 60;
      const nowMs = Date.now();

      const [h, m] = entryTimeStr.split(":").map(Number);
      const entryDate = new Date();
      entryDate.setHours(h, m, 0, 0);

      const currentDate = new Date();
      if (h === currentDate.getHours() && m === currentDate.getMinutes()) {
        entryDate.setTime(nowMs);
      }

      const newState: TimerState = {
        isActive: true,
        startTime: entryDate.getTime(),
        targetWorkMs: totalWorkHours * MS_PER_HOUR,
        targetBreakMs: breakMinutes * MS_PER_MINUTE,
        accumulatedWorkMs: 0,
        accumulatedBreakMs: 0,
        lastStatusChange: entryDate.getTime(),
        status: "working",
        logs: [{ type: "Start", time: entryDate.getTime() }],
      };

      setState(newState);
      sendLogToBackend("punch-in", entryDate.toISOString());
      syncTimerStateToBackend(newState);
      setLastSynced(new Date());
    },
    [],
  );

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const punchToggle = useCallback((manualTimeMs?: number) => {
    const nowMs = Date.now();
    const punchTime = manualTimeMs || nowMs;

    if (punchTime > nowMs) {
      return { success: false, error: "Cannot punch in the future." };
    }

    const prevState = stateRef.current;
    if (prevState.lastStatusChange && punchTime <= prevState.lastStatusChange) {
      return {
        success: false,
        error: "New punch time must be after the last action.",
      };
    }

    setState((prev) => {
      let newState: TimerState;
      const effectiveNow = punchTime;

      if (prev.status === "working") {
        const sessionDuration =
          effectiveNow - (prev.lastStatusChange || effectiveNow);
        const newAccWork = prev.accumulatedWorkMs + sessionDuration;

        sendLogToBackend(
          "punch-out",
          new Date(effectiveNow).toISOString(),
          formatShortTime(newAccWork),
        );

        newState = {
          ...prev,
          accumulatedWorkMs: newAccWork,
          status: "break" as TimerStatus,
          lastStatusChange: effectiveNow,
          logs: [
            { type: "Punch Out (Break)", time: effectiveNow },
            ...prev.logs,
          ].slice(0, 50),
        };
      } else if (prev.status === "break") {
        const sessionDuration =
          effectiveNow - (prev.lastStatusChange || effectiveNow);
        const newAccBreak = prev.accumulatedBreakMs + sessionDuration;

        sendLogToBackend("punch-in", new Date(effectiveNow).toISOString());

        newState = {
          ...prev,
          accumulatedBreakMs: newAccBreak,
          status: "working" as TimerStatus,
          lastStatusChange: effectiveNow,
          logs: [
            { type: "Punch In (Work)", time: effectiveNow },
            ...prev.logs,
          ].slice(0, 50),
        };
      } else {
        return prev;
      }

      syncTimerStateToBackend(newState);
      setLastSynced(new Date());
      return newState;
    });

    return { success: true };
  }, []);

  const resetDay = useCallback(async () => {
    const prev = stateRef.current;
    const nowMs = Date.now();

    // If the timer is active, punch out the current session first so the DB record is closed
    if (prev.isActive && (prev.status === "working" || prev.status === "break")) {
      // If on break, first close the break period, then punch out the work session
      if (prev.status === "break" && prev.lastStatusChange) {
        // Accumulate the break time that was in progress
        const breakDuration = nowMs - prev.lastStatusChange;
        const totalBreakMs = prev.accumulatedBreakMs + breakDuration;
        // The work session was already paused, so just close with accumulated work
        await sendLogToBackend(
          "punch-out",
          new Date(nowMs).toISOString(),
          formatShortTime(prev.accumulatedWorkMs),
        );
      } else if (prev.status === "working" && prev.lastStatusChange) {
        const totalWorkMs = prev.accumulatedWorkMs + (nowMs - prev.lastStatusChange);
        await sendLogToBackend(
          "punch-out",
          new Date(nowMs).toISOString(),
          formatShortTime(totalWorkMs),
        );
      }
    }

    localStorage.removeItem("wtt_state_next");
    offlineQueue.clearQueue(); // discard any pending offline actions for old session
    setState(defaultState);
    await clearTimerStateFromBackend();
  }, []);

  const clearToday = useCallback(async () => {
    // Always reset local state immediately (offline-safe)
    localStorage.removeItem("wtt_state_next");
    setState(defaultState);

    try {
      const res = await fetch("/api/worklog/today", { method: "DELETE" });
      if (res.ok) {
        return { success: true };
      }
      // Server responded but with an error
      const data = await res.json().catch(() => ({}));
      // Even on error, local state is already cleared — queue the DELETE
      offlineQueue.enqueue("/api/worklog/today", "DELETE");
      return {
        success: false,
        error: data.error || "Failed to clear today's data on server.",
      };
    } catch {
      // Offline — queue the DELETE for when connectivity returns
      offlineQueue.enqueue("/api/worklog/today", "DELETE");
      return { success: true }; // Local clear succeeded
    }
  }, []);

  const addHistoricalBreak = useCallback(
    (
      punchOutMs: number,
      punchInMs: number,
    ): { success: boolean; error?: string } => {
      const nowMs = Date.now();

      if (punchOutMs >= punchInMs) {
        return {
          success: false,
          error: "Punch-In time must be after Punch-Out time.",
        };
      }
      if (punchOutMs >= nowMs) {
        return {
          success: false,
          error: "Punch-Out time cannot be in the future.",
        };
      }
      if (punchInMs > nowMs) {
        return {
          success: false,
          error: "Punch-In time cannot be in the future.",
        };
      }

      const breakDuration = punchInMs - punchOutMs;

      setState((prev) => {
        const lastChange = prev.lastStatusChange ?? prev.startTime ?? 0;
        const isWorking = prev.status === "working";

        let committedDeduction = breakDuration;
        let liveDeduction = 0;

        if (isWorking && punchInMs > lastChange) {
          const overlapStart = Math.max(punchOutMs, lastChange);
          liveDeduction = punchInMs - overlapStart;
          committedDeduction = breakDuration - liveDeduction;
        }

        const newAccWork = Math.max(
          0,
          prev.accumulatedWorkMs - committedDeduction,
        );
        const newAccBreak = prev.accumulatedBreakMs + breakDuration;

        const newLastStatusChange =
          isWorking && liveDeduction > 0
            ? lastChange + liveDeduction
            : prev.lastStatusChange;

        const newLogs = [
          { type: "Punch Out (Break)", time: punchOutMs },
          { type: "Punch In (Work)", time: punchInMs },
          ...prev.logs,
        ]
          .sort((a, b) => b.time - a.time)
          .slice(0, 50);

        const newState: TimerState = {
          ...prev,
          accumulatedWorkMs: newAccWork,
          accumulatedBreakMs: newAccBreak,
          lastStatusChange: newLastStatusChange,
          logs: newLogs,
        };

        syncTimerStateToBackend(newState);
        return newState;
      });

      // Fire-and-forget add-break DB sync (enqueue on failure)
      const addBreakBody = {
        breakStart: new Date(punchOutMs).toISOString(),
        breakEnd: new Date(punchInMs).toISOString(),
      };
      fetch("/api/worklog/add-break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addBreakBody),
      }).catch(() => {
        offlineQueue.enqueue("/api/worklog/add-break", "POST", addBreakBody);
      });

      setLastSynced(new Date());
      return { success: true };
    },
    [],
  );

  // Stale timer detection: timer started on a different calendar day
  const isStaleTimer = (() => {
    if (!state.isActive || !state.startTime) return false;
    const startDate = new Date(state.startTime);
    const today = new Date();
    return (
      startDate.getFullYear() !== today.getFullYear() ||
      startDate.getMonth() !== today.getMonth() ||
      startDate.getDate() !== today.getDate()
    );
  })();

  const terminatePreviousTimer = useCallback(
    async (endTimeMs: number): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/worklog/terminate-previous", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endTime: new Date(endTimeMs).toISOString() }),
        });
        if (!res.ok) {
          const data = await res.json();
          return {
            success: false,
            error: data.error || "Failed to terminate previous timer.",
          };
        }
        // Clear local state
        localStorage.removeItem("wtt_state_next");
        setState(defaultState);
        await clearTimerStateFromBackend();
        return { success: true };
      } catch (err) {
        console.error("terminatePreviousTimer error:", err);
        return { success: false, error: "Network error." };
      }
    },
    [],
  );

  return {
    state,
    totalWork,
    totalBreak,
    remainingWork,
    remainingBreak,
    isOvertime,
    currentTime,
    lastSynced,
    isLoaded,
    isStaleTimer,
    startDay,
    punchToggle,
    addHistoricalBreak,
    resetDay,
    clearToday,
    terminatePreviousTimer,
    updateSession: useCallback(
      (index: number, newPunchIn: number, newPunchOut: number | null) => {
        setState((prev) => {
          const rows = buildSessionRows(prev.logs, prev.status);
          const rowToEdit = rows[index];
          if (!rowToEdit) return prev;

          const newLogs = [...prev.logs];
          newLogs[rowToEdit.inLogIndex] = {
            ...newLogs[rowToEdit.inLogIndex],
            time: newPunchIn,
          };
          if (rowToEdit.outLogIndex !== null && newPunchOut !== null) {
            newLogs[rowToEdit.outLogIndex] = {
              ...newLogs[rowToEdit.outLogIndex],
              time: newPunchOut,
            };
          }

          // Sort logs descending (latest first) as per useWorkTimer convention
          newLogs.sort((a, b) => b.time - a.time);

          // Recalculate accumulated times
          const sortedAsc = [...newLogs].sort((a, b) => a.time - b.time);
          let accWork = 0;
          let accBreak = 0;
          let lastOut: number | null = null;
          let currentIn: number | null = null;

          for (const log of sortedAsc) {
            if (log.type === "Start" || log.type === "Punch In (Work)") {
              currentIn = log.time;
              if (lastOut !== null) {
                accBreak += currentIn - lastOut;
              }
            } else if (log.type === "Punch Out (Break)" && currentIn !== null) {
              accWork += log.time - currentIn;
              lastOut = log.time;
              currentIn = null;
            }
          }

          // If the last session is ongoing, status remains 'working'
          // and we only care about accumulated completed work.
          // currentSessionWork will be added in the computed values.

          const newState: TimerState = {
            ...prev,
            logs: newLogs,
            accumulatedWorkMs: accWork,
            accumulatedBreakMs: accBreak,
            // If the edited row was the most recent one, update lastStatusChange
            lastStatusChange:
              index === rows.length - 1
                ? (prev.status === "working" ? newPunchIn : (newPunchOut ?? prev.lastStatusChange))
                : prev.lastStatusChange,
          };

          syncTimerStateToBackend(newState);
          // Also sync to worklog table
          fetch("/api/worklog/today/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logs: newLogs }),
          }).catch(() => {
            offlineQueue.enqueue("/api/worklog/today/sync", "POST", { logs: newLogs });
          });

          return newState;
        });
      },
      [],
    ),
    deleteSession: useCallback((index: number) => {
      setState((prev) => {
        const rows = buildSessionRows(prev.logs, prev.status);
        const rowToDelete = rows[index];
        if (!rowToDelete) return prev;

        const newLogs = prev.logs.filter(
          (_, i) =>
            i !== rowToDelete.inLogIndex && i !== rowToDelete.outLogIndex,
        );

        // Recalculate accumulated times
        const sortedAsc = [...newLogs].sort((a, b) => a.time - b.time);
        let accWork = 0;
        let accBreak = 0;
        let lastOut: number | null = null;
        let currentIn: number | null = null;

        for (const log of sortedAsc) {
          if (log.type === "Start" || log.type === "Punch In (Work)") {
            currentIn = log.time;
            if (lastOut !== null) {
              accBreak += currentIn - lastOut;
            }
          } else if (log.type === "Punch Out (Break)" && currentIn !== null) {
            accWork += log.time - currentIn;
            lastOut = log.time;
            currentIn = null;
          }
        }

        const newState: TimerState = {
          ...prev,
          logs: newLogs,
          accumulatedWorkMs: accWork,
          accumulatedBreakMs: accBreak,
        };

        // If we deleted all logs, reset active state? Or just let it be empty?
        if (newLogs.length === 0) {
           newState.isActive = false;
           newState.status = "idle";
           newState.startTime = null;
           newState.lastStatusChange = null;
        }

        syncTimerStateToBackend(newState);
        fetch("/api/worklog/today/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logs: newLogs }),
        }).catch(() => {
          offlineQueue.enqueue("/api/worklog/today/sync", "POST", { logs: newLogs });
        });

        return newState;
      });
    }, []),
    formatTime,
    formatShortTime,
  };
}
