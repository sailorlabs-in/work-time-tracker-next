"use client";

import { useEffect, useState, useRef } from "react";
import {
  useWorkTimer,
  formatShortTime,
  TimerLog,
  TimerStatus,
  TimerState,
  buildSessionRows,
  SessionRow,
} from "@/hooks/useWorkTimer";
import {
  RiCupLine,
  RiCheckLine,
  RiPlayCircleLine,
  RiPlayFill,
  RiTimeLine,
  RiCalendarLine,
  RiArrowRightLine,
  RiRocketLine,
  RiRecordCircleFill,
  RiPauseCircleFill,
  RiPauseFill,
  RiErrorWarningLine,
  RiDeleteBinLine,
  RiEdit2Line,
  RiFlagLine,
  RiTimerLine,
  RiCloseLine,
} from "@remixicon/react";
import OfflineBanner from "@/components/OfflineBanner";
import { ConfirmationModal } from "@/app/calendar/_components/DayDetailModal";
import TodayNotificationsCard from "./TodayNotificationsCard";
import DailyNoteCard from "./DailyNoteCard";
import { useServerTime } from "@/hooks/useServerTime";

interface UserProfile {
  timeFormat?: string;
  workHours?: number;
  workMinutes?: number;
  breakMinutes?: number;
  notificationsEnabled?: boolean;
  notifyOnCompletion?: boolean;
  notifyConstant?: boolean;
  notifyInterval?: number;
}

interface DashboardClientProps {
  initialTimerState: TimerState | null;
  userProfile: UserProfile | null;
}

function timeStrToMs(timeStr: string, referenceMs?: number): number {
  const [h, m] = timeStr.split(":").map(Number);
  const d = referenceMs ? new Date(referenceMs) : new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function nowTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function fmtTime(ms: number, format: "12h" | "24h" = "12h"): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: format === "12h",
  });
}

function getOtMinutes(totalWorkMs: number, targetWorkMs?: number): number {
  const standardWorkMs = targetWorkMs || 8 * 3600000;
  if (totalWorkMs < standardWorkMs) return 0;
  const overtimeMin = Math.floor((totalWorkMs - standardWorkMs) / 60000);
  if (overtimeMin < 30) return 0;
  return Math.floor((overtimeMin - 15) / 30) * 30 + 30;
}

function formatOtMinutes(minutes: number): string {
  if (minutes === 0) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min Overtime`;
  if (m === 0) return `${h}hr Overtime`;
  return `${h}hr ${m} min Overtime`;
}

// ─── OT Milestones calculation ────────────────────────────────
interface OtMilestone {
  label: string;
  otMinutes: number;
  thresholdMs: number;
  clockTime: string | null; // null if already passed
  isPassed: boolean;
}

function computeOtMilestones(
  totalWorkMs: number,
  targetWorkMs: number,
  currentTime: number,
  isWorking: boolean,
  timeFormat: "12h" | "24h",
): OtMilestone[] {
  const tiers = [
    { label: "Work Complete", otMinutes: 0, thresholdMs: targetWorkMs },
    {
      label: "30min Overtime",
      otMinutes: 30,
      thresholdMs: targetWorkMs + 30 * 60000,
    },
    {
      label: "1hr Overtime",
      otMinutes: 60,
      thresholdMs: targetWorkMs + 45 * 60000,
    },
    {
      label: "1hr 30min Overtime",
      otMinutes: 90,
      thresholdMs: targetWorkMs + 75 * 60000,
    },
    {
      label: "2hr Overtime",
      otMinutes: 120,
      thresholdMs: targetWorkMs + 105 * 60000,
    },
    {
      label: "2hr 30min Overtime",
      otMinutes: 150,
      thresholdMs: targetWorkMs + 135 * 60000,
    },
  ];

  return tiers.map((tier) => {
    const isPassed = totalWorkMs >= tier.thresholdMs;
    let clockTime: string | null = null;

    if (isPassed) {
      // Already passed — show when it was achieved (approximate)
      clockTime = "Completed";
    } else if (isWorking) {
      // Only calculate future time when currently working
      const msRemaining = tier.thresholdMs - totalWorkMs;
      const futureMs = currentTime + msRemaining;
      clockTime = new Date(futureMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: timeFormat === "12h",
      });
    } else {
      // On break — can't predict
      clockTime = "On Break";
    }

    return { ...tier, clockTime, isPassed };
  });
}

// ─── Modal: OT Milestones ────────────────────────────────────
interface OtMilestonesModalProps {
  onClose: () => void;
  milestones: OtMilestone[];
  currentOtMinutes: number;
}

function OtMilestonesModal({
  onClose,
  milestones,
  currentOtMinutes,
}: OtMilestonesModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card ot-milestones-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-centered">
          <span className="modal-icon">
            <RiTimerLine size={28} />
          </span>
          <h2>OT Milestones</h2>
          <p className="modal-subtitle">
            {currentOtMinutes > 0
              ? `Current: ${formatOtMinutes(currentOtMinutes)}`
              : "Work completion & overtime schedule"}
          </p>
        </div>

        <div className="ot-milestones-list">
          {milestones.map((m, i) => (
            <div
              key={i}
              className={`ot-milestone-row${
                m.isPassed ? " ot-milestone-passed" : ""
              }${i === 0 ? " ot-milestone-work-complete" : ""}`}
            >
              <div className="ot-milestone-indicator">
                <span
                  className={`ot-milestone-dot${m.isPassed ? " passed" : ""}`}
                />
                {i < milestones.length - 1 && (
                  <span className="ot-milestone-line" />
                )}
              </div>
              <div className="ot-milestone-info">
                <span className="ot-milestone-label">{m.label}</span>
                <span className="ot-milestone-sublabel">
                  {i === 0
                    ? formatShortTime(m.thresholdMs) + " worked"
                    : `+${formatShortTime(m.thresholdMs - milestones[0].thresholdMs)} after completion`}
                </span>
              </div>
              <div className="ot-milestone-time mono">
                {m.isPassed ? (
                  <span className="ot-milestone-check">
                    <RiCheckLine size={16} />
                  </span>
                ) : (
                  <span>{m.clockTime}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer" style={{ paddingTop: "16px" }}>
          <button className="btn-secondary btn-full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Build tabular session rows from log ─────────────────────
// interface SessionRow {
//   punchIn: number;
//   punchOut: number | null;
// }

// function buildSessionRows(logs: TimerLog[], status: TimerStatus): SessionRow[] {
//   const sorted = [...logs].sort((a, b) => a.time - b.time);
//   const rows: SessionRow[] = [];
//   let currentIn: number | null = null;

//   for (const log of sorted) {
//     if (log.type === "Start" || log.type === "Punch In (Work)") {
//       currentIn = log.time;
//     } else if (log.type === "Punch Out (Break)" && currentIn !== null) {
//       rows.push({ punchIn: currentIn, punchOut: log.time });
//       currentIn = null;
//     }
//   }

//   if (status === "working" && currentIn !== null) {
//     rows.push({ punchIn: currentIn, punchOut: null });
//   }

//   return rows;
// }

// ─── Modal: Add Break Entry ───────────────────────────────────
interface AddBreakModalProps {
  onClose: () => void;
  onSubmit: (punchOut: string, punchIn: string) => string | null;
}

function AddBreakModal({ onClose, onSubmit }: AddBreakModalProps) {
  const [punchOut, setPunchOut] = useState(nowTimeStr());
  const [punchIn, setPunchIn] = useState(nowTimeStr());
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const err = onSubmit(punchOut, punchIn);
    if (err) setError(err);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-centered">
          <span className="modal-icon">
            <RiCupLine size={24} />
          </span>
          <h2>Add Break Entry</h2>
          <p className="modal-subtitle">
            Manually record a break you already took (any time today)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="modal-time-row">
            <div className="form-group">
              <label htmlFor="breakPunchOut">Break Started</label>
              <input
                id="breakPunchOut"
                type="time"
                value={punchOut}
                onChange={(e) => setPunchOut(e.target.value)}
                required
              />
            </div>
            <div className="modal-time-arrow">→</div>
            <div className="form-group">
              <label htmlFor="breakPunchIn">Break Ended</label>
              <input
                id="breakPunchIn"
                type="time"
                value={punchIn}
                onChange={(e) => setPunchIn(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              <RiCheckLine size={18} /> Add Break
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Late Punch-Out ────────────────────────────────────
interface LatePunchOutModalProps {
  onClose: () => void;
  onSubmit: (punchOut: string) => string | null;
}

function LatePunchOutModal({ onClose, onSubmit }: LatePunchOutModalProps) {
  const [punchOut, setPunchOut] = useState(nowTimeStr());
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const err = onSubmit(punchOut);
    if (err) setError(err);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-centered">
          <span className="modal-icon">
            <RiPauseCircleFill size={24} />
          </span>
          <h2>Set Stop Time</h2>
          <p className="modal-subtitle">
            Set the time you actually stopped working
          </p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="latePunchOut">Stop Time</label>
            <input
              id="latePunchOut"
              type="time"
              value={punchOut}
              onChange={(e) => setPunchOut(e.target.value)}
              required
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-punch-out">
              <RiPauseFill size={18} /> Stop Time
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Late Punch-In ─────────────────────────────────────
interface LatePunchInModalProps {
  onClose: () => void;
  onSubmit: (punchIn: string) => string | null;
}

function LatePunchInModal({ onClose, onSubmit }: LatePunchInModalProps) {
  const [punchIn, setPunchIn] = useState(nowTimeStr());
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const err = onSubmit(punchIn);
    if (err) setError(err);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-centered">
          <span className="modal-icon">
            <RiPlayCircleLine size={24} />
          </span>
          <h2>Resume Work</h2>
          <p className="modal-subtitle">
            Set the time you actually resumed working
          </p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="latePunchIn">Punch-In Time</label>
            <input
              id="latePunchIn"
              type="time"
              value={punchIn}
              onChange={(e) => setPunchIn(e.target.value)}
              required
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-punch-in">
              <RiPlayFill size={18} />
              Start time
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Edit Session ───────────────────────────────────────
interface EditSessionModalProps {
  session: SessionRow;
  index: number;
  onClose: () => void;
  onSubmit: (punchIn: string, punchOut: string | null) => void;
}

function EditSessionModal({
  session,
  index,
  onClose,
  onSubmit,
}: EditSessionModalProps) {
  const toTimeStr = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const [punchIn, setPunchIn] = useState(toTimeStr(session.punchIn));
  const [punchOut, setPunchOut] = useState(
    session.punchOut ? toTimeStr(session.punchOut) : "",
  );
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (punchOut && punchIn >= punchOut) {
      setError("End time must be after start time.");
      return;
    }
    onSubmit(punchIn, punchOut || null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-centered">
          <span className="modal-icon">
            <RiEdit2Line size={24} />
          </span>
          <h2>Edit Session {index + 1}</h2>
          <p className="modal-subtitle">Update the start and end times</p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="editPunchIn">Start Time</label>
            <input
              id="editPunchIn"
              type="time"
              value={punchIn}
              onChange={(e) => setPunchIn(e.target.value)}
              required
              disabled={index === 0}
              className={index === 0 ? "input-disabled" : ""}
            />
          </div>

          {session.punchOut !== null && (
            <div className="form-group">
              <label htmlFor="editPunchOut">End Time</label>
              <input
                id="editPunchOut"
                type="time"
                value={punchOut}
                onChange={(e) => setPunchOut(e.target.value)}
                required
              />
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              <RiCheckLine size={18} /> Update Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Session Panel (right column) ────────────────────────────
function SessionPanel({
  logs,
  status,
  currentTime,
  onEdit,
  onDelete,
  onOpenOtModal,
}: {
  logs: TimerLog[];
  status: TimerStatus;
  currentTime: number;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onOpenOtModal: () => void;
}) {
  const rows = buildSessionRows(logs, status);

  return (
    <div className="session-panel glass-card animate-in">
      <div className="session-panel-header">
        <button
          className="session-panel-icon-btn"
          onClick={onOpenOtModal}
          title="View OT Milestones"
        >
          <RiTimeLine className="session-panel-icon" size={20} />
        </button>
        <span className="session-panel-title">Today&apos;s Sessions</span>
        <span className="session-panel-count">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="session-panel-empty">
          <RiCalendarLine size={24} />
          <span>No sessions yet</span>
        </div>
      ) : (
        <div className="session-panel-list">
          {rows.map((row, i) => {
            const durationMs = row.punchOut
              ? row.punchOut - row.punchIn
              : currentTime - row.punchIn;
            const h = Math.floor(durationMs / 3600000);
            const m = Math.floor((durationMs % 3600000) / 60000);
            const durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
            const isActive = row.punchOut === null;

            return (
              <div
                key={i}
                className={`session-panel-row${isActive ? " session-panel-row-active" : ""}`}
              >
                <div className="session-panel-main">
                  <div className="session-panel-num">{i + 1}</div>
                  <div className="session-panel-times">
                    <span className="session-panel-time mono">
                      {fmtTime(row.punchIn)}
                    </span>
                    <RiArrowRightLine
                      className="session-panel-arrow"
                      size={14}
                    />
                    <span className="session-panel-time mono">
                      {row.punchOut ? (
                        fmtTime(row.punchOut)
                      ) : (
                        <span className="session-ongoing">ongoing</span>
                      )}
                    </span>
                  </div>
                  <div className="session-panel-dur mono">{durationStr}</div>
                </div>

                <div className="session-panel-actions">
                  <button
                    className="session-action-btn edit"
                    onClick={() => onEdit(i)}
                    title="Edit Session"
                  >
                    <RiEdit2Line size={16} />
                  </button>
                  <button
                    className="session-action-btn delete"
                    onClick={() => onDelete(i)}
                    title="Delete Session"
                  >
                    <RiDeleteBinLine size={16} />
                  </button>
                </div>

                {isActive && (
                  <span className="session-panel-live-dot" title="Active" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────
export default function DashboardClient({
  initialTimerState,
  userProfile,
}: DashboardClientProps) {
  const { getServerNow, isSynced: isTimeSynced } = useServerTime();

  const {
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
    updateSession,
    deleteSession,
    addCustomNotification,
    deleteCustomNotification,
    formatTime: ft,
  } = useWorkTimer(initialTimerState, userProfile, getServerNow);

  const [workHours, setWorkHours] = useState(userProfile?.workHours ?? 8);
  const [workMinutes, setWorkMinutes] = useState(userProfile?.workMinutes ?? 0);
  const [breakMinutes, setBreakMinutes] = useState(
    userProfile?.breakMinutes ?? 60,
  );
  const timeFormat = userProfile?.timeFormat === "24h" ? "24h" : "12h";
  const [entryTime, setEntryTime] = useState(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  });

  const [timeStr, setTimeStr] = useState<string>("");
  const [leaveTimeStr, setLeaveTimeStr] = useState<string>("");
  const [earlyLeaveTimeStr, setEarlyLeaveTimeStr] = useState<string>("");
  const [startTimeStr, setStartTimeStr] = useState<string>("--:--");
  const [lastSyncedStr, setLastSyncedStr] = useState<string>("");
  const [nextOtTimeStr, setNextOtTimeStr] = useState<string>("");
  const [showSecretOt, setShowSecretOt] = useState(false);
  const [showOtMilestonesModal, setShowOtMilestonesModal] = useState(false);
  const secretTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [showBreakModal, setShowBreakModal] = useState(false);
  const [showLatePunchInModal, setShowLatePunchInModal] = useState(false);
  const [showLatePunchOutModal, setShowLatePunchOutModal] = useState(false);
  const [editingSessionIdx, setEditingSessionIdx] = useState<number | null>(
    null,
  );
  const [pendingDeleteSessionIdx, setPendingDeleteSessionIdx] = useState<
    number | null
  >(null);
  const [isConfirmingClearToday, setIsConfirmingClearToday] = useState(false);

  const [note, setNote] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function fetchTodayNote() {
      try {
        const todayStr = new Date().toLocaleDateString("en-CA");
        const res = await fetch(`/api/notes?date=${todayStr}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.note) {
            setNote(data.note);
          }
        }
      } catch (err) {
        console.error("Failed to fetch today's note:", err);
      }
    }
    fetchTodayNote();
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleNoteChange = (newNote: string) => {
    setNote(newNote);
    setSaveStatus("saving");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const todayStr = new Date().toLocaleDateString("en-CA");
      const body = { date: todayStr, note: newNote };

      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          setSaveStatus("saved");
        } else {
          throw new Error("Failed to save note on server");
        }
      } catch (err) {
        console.error("Failed to save note:", err);
        const offlineQueue = await import("@/lib/offlineQueue");
        offlineQueue.enqueue("/api/notes", "POST", body);
        setSaveStatus("saved");
      }
    }, 1000);
  };

  useEffect(() => {
    const updateTime = () => {
      const now = getServerNow ? getServerNow() : Date.now();
      setTimeStr(
        new Date(now).toLocaleTimeString([], { hour12: timeFormat === "12h" }),
      );

      if (remainingWork) {
        const targetTime = now + remainingWork + 60000;
        setLeaveTimeStr(
          new Date(targetTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          }),
        );
        setEarlyLeaveTimeStr(
          new Date(targetTime - 30 * 60000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          }),
        );
      }

      const standardWorkMs = state.targetWorkMs || 8 * 3600000;
      const currentOtMin = getOtMinutes(totalWork, standardWorkMs);
      const nextTierMin = currentOtMin === 0 ? 30 : currentOtMin + 30;
      const nextOtThresholdMs =
        nextTierMin === 30
          ? standardWorkMs + 30 * 60000
          : standardWorkMs + (nextTierMin - 15) * 60000;

      // Only calculate next OT time when actively working
      if (state.status === "working") {
        const msUntilNextOt = nextOtThresholdMs - totalWork;
        const nextOtClockTime = now + msUntilNextOt;
        setNextOtTimeStr(
          new Date(nextOtClockTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          }),
        );
      } else {
        setNextOtTimeStr("On Break");
      }

      if (state.startTime) {
        setStartTimeStr(
          new Date(state.startTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          }),
        );
      } else {
        setStartTimeStr("--:--");
      }

      if (lastSynced) {
        setLastSyncedStr(
          lastSynced.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          }),
        );
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [remainingWork, totalWork, state.startTime, lastSynced, timeFormat]);

  // entryTime is initialized in useState

  if (!isLoaded) {
    return (
      <div className="page-loader">
        <div className="loader-spinner" />
      </div>
    );
  }

  const handleStartDay = () => {
    startDay(workHours, workMinutes, breakMinutes, entryTime);
  };

  const handleAddBreak = (
    punchOutStr: string,
    punchInStr: string,
  ): string | null => {
    const refMs = state.startTime ?? undefined;
    const punchOutMs = timeStrToMs(punchOutStr, refMs);
    const punchInMs = timeStrToMs(punchInStr, refMs);
    const r = addHistoricalBreak(punchOutMs, punchInMs);
    if (!r.success) return r.error ?? "Failed to add break.";
    setShowBreakModal(false);
    return null;
  };

  const handleLatePunchOut = (punchOutStr: string): string | null => {
    if (state.status !== "working") return "You are not currently working.";
    const punchOutMs = timeStrToMs(punchOutStr, state.startTime ?? undefined);
    if (punchOutMs > Date.now()) return "Stop time cannot be in the future.";
    const r = punchToggle(punchOutMs);
    if (!r.success) return r.error ?? "Failed to stop time.";
    setShowLatePunchOutModal(false);
    return null;
  };

  const handleLatePunchIn = (punchInStr: string): string | null => {
    if (state.status !== "break") return "You are not currently on break.";
    const punchInMs = timeStrToMs(punchInStr, state.startTime ?? undefined);
    if (punchInMs > Date.now()) return "Punch-In time cannot be in the future.";
    const r = punchToggle(punchInMs);
    if (!r.success) return r.error ?? "Failed to punch in.";
    setShowLatePunchInModal(false);
    return null;
  };

  const triggerSecretOt = () => {
    if (secretTimerRef.current) clearTimeout(secretTimerRef.current);
    setShowSecretOt(true);
    secretTimerRef.current = setTimeout(() => setShowSecretOt(false), 7000);
  };

  return (
    <>
      {showLatePunchOutModal && (
        <LatePunchOutModal
          onClose={() => setShowLatePunchOutModal(false)}
          onSubmit={handleLatePunchOut}
        />
      )}
      {showBreakModal && (
        <AddBreakModal
          onClose={() => setShowBreakModal(false)}
          onSubmit={handleAddBreak}
        />
      )}
      {showLatePunchInModal && (
        <LatePunchInModal
          onClose={() => setShowLatePunchInModal(false)}
          onSubmit={handleLatePunchIn}
        />
      )}

      {editingSessionIdx !== null &&
        (() => {
          const session = buildSessionRows(state.logs, state.status)[
            editingSessionIdx
          ];
          if (!session) return null;
          return (
            <EditSessionModal
              session={session}
              index={editingSessionIdx}
              onClose={() => setEditingSessionIdx(null)}
              onSubmit={(inStr, outStr) => {
                updateSession(
                  editingSessionIdx,
                  timeStrToMs(inStr, session.punchIn),
                  outStr ? timeStrToMs(outStr, session.punchIn) : null,
                );
                setEditingSessionIdx(null);
              }}
            />
          );
        })()}

      <div className={`main-content${state.isActive ? " dashboard-page" : ""}`}>
        {!state.isActive ? (
          /* ─── Setup Form ─── */
          <div className="glass-card setup-card animate-in">
            <div className="card-header">
              <h1 className="gradient-text">Work Time Tracker</h1>
              <p className="subtitle">Plan your day efficiently.</p>
            </div>

            <div className="form-group">
              <label>Work Duration</label>
              <div className="dual-input">
                <div className="input-half">
                  <span className="input-label-small">Hours</span>
                  <input
                    className="input-disabled"
                    type="number"
                    id="workHours"
                    disabled
                    value={workHours}
                    onChange={(e) => setWorkHours(Number(e.target.value))}
                    min="0"
                    max="24"
                  />
                </div>
                <div className="input-half">
                  <span className="input-label-small">Minutes</span>
                  <input
                    className="input-disabled"
                    type="number"
                    id="workMinutes"
                    disabled
                    value={workMinutes}
                    onChange={(e) => setWorkMinutes(Number(e.target.value))}
                    min="0"
                    max="59"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Break Time (Minutes)</label>
              <input
                className="input-disabled"
                type="number"
                id="breakMinutes"
                disabled
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value))}
                min="0"
              />
            </div>

            <div className="form-group">
              <label>Entry Time(starting time of work)</label>
              <input
                type="time"
                id="entryTime"
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
              />
            </div>

            <button onClick={handleStartDay} className="btn-primary btn-full">
              <RiRocketLine size={18} /> Start Day
            </button>
          </div>
        ) : (
          /* ─── Active Timer — two-column grid ─── */
          <div className="dashboard-grid">
            {/* LEFT: Timer card */}
            <div className="glass-card dashboard-card animate-in">
              <div className="dash-header">
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span
                    className={`status-badge ${state.status === "working" ? "working" : "on-break"}`}
                    onClick={triggerSecretOt}
                    style={{ cursor: "pointer" }}
                  >
                    {state.status === "working" ? (
                      <>
                        <RiRecordCircleFill size={14} /> Working
                      </>
                    ) : (
                      <>
                        <RiPauseCircleFill size={14} /> On Break
                      </>
                    )}
                  </span>
                  <OfflineBanner />
                </div>
                <span className="clock-display mono">{timeStr}</span>
              </div>

              <div className="timer-hero">
                <span className="timer-label">
                  {isOvertime ? "Overtime" : "Remaining work"}
                </span>
                <span
                  className={`timer-value mono ${isOvertime ? "overtime" : ""}`}
                >
                  {isOvertime ? "+" : ""}
                  {ft(Math.abs(remainingWork))}
                </span>
              </div>

              {(!isOvertime || showSecretOt) && (
                <div className="leave-time-display">
                  {!showSecretOt ? (
                    <>
                      <span className="leave-time-label">
                        You can leave at{" "}
                      </span>
                      <span
                        className="leave-time-value mono"
                        title={`Early leave: ${earlyLeaveTimeStr}`}
                      >
                        {leaveTimeStr}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="leave-time-label">
                        {getOtMinutes(totalWork, state.targetWorkMs) === 0
                          ? `${formatOtMinutes(30)} starts at`
                          : `${formatOtMinutes(getOtMinutes(totalWork, state.targetWorkMs) + 30)} at`}
                      </span>
                      <span className="leave-time-value mono">
                        {nextOtTimeStr}
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="sync-status">
                <span className="sync-dot" />
                <span>
                  Auto-sync active
                  {lastSyncedStr && <> · Last synced {lastSyncedStr}</>}
                </span>
              </div>

              <div className="stats-grid">
                <div className="stat-card mb-center">
                  <span className="stat-label">Worked</span>
                  <span className="stat-value mono">
                    {formatShortTime(totalWork)}
                  </span>
                </div>
                <div className="stat-card mb-center">
                  <span className="stat-label">Break Used</span>
                  <span className="stat-value mono ">
                    {formatShortTime(totalBreak)}
                  </span>
                </div>
                <div className="stat-card mb-center">
                  <span className="stat-label">Break Left</span>
                  <span
                    className={`stat-value mono mb-center ${remainingBreak <= 0 ? "danger" : ""}`}
                  >
                    {formatShortTime(Math.max(0, remainingBreak))}
                  </span>
                </div>
                <div className="stat-card mb-center">
                  <span className="stat-label">Entry Time</span>
                  <span className="stat-value mono">{startTimeStr}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="punch-actions">
                {state.status === "working" ? (
                  <>
                    <button
                      onClick={() => punchToggle()}
                      className="btn-punch-out btn-full"
                    >
                      <RiPauseFill size={20} /> Punch Out (Now)
                    </button>
                    <button
                      onClick={() => setShowLatePunchOutModal(true)}
                      className="btn-late-punchin btn-full"
                    >
                      <RiTimeLine size={20} /> I Already Stopped — Set Time
                    </button>
                    <button
                      onClick={() => setShowBreakModal(true)}
                      className="btn-break btn-full"
                    >
                      <RiCupLine size={20} /> Add Break Entry
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => punchToggle()}
                      className="btn-punch-in btn-full"
                    >
                      <RiPlayFill size={20} /> Punch In (Now)
                    </button>
                    <button
                      onClick={() => setShowLatePunchInModal(true)}
                      className="btn-late-punchin btn-full"
                    >
                      <RiTimeLine size={20} /> I Already Resumed — Set Time
                    </button>
                  </>
                )}
              </div>

              <div className="danger-zone">
                <div
                  className="danger-zone-header"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <RiErrorWarningLine size={20} />
                    <span className="danger-zone-title">Danger Zone</span>
                  </div>
                  <button
                    onClick={() => setIsConfirmingClearToday(true)}
                    className="btn-danger-outline"
                    style={{
                      padding: "6px",
                      borderRadius: "6px",
                      background: "none",
                      border: "1px solid transparent",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--danger-color)";
                      e.currentTarget.style.borderColor =
                        "rgba(239, 83, 80, 0.2)";
                      e.currentTarget.style.background =
                        "rgba(239, 83, 80, 0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--text-muted)";
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.background = "none";
                    }}
                    title="Clear Today's Logs"
                  >
                    <RiDeleteBinLine size={16} />
                  </button>
                </div>
                <div className="danger-actions" style={{ marginTop: "12px" }}>
                  <button
                    onClick={resetDay}
                    className="btn-danger"
                    style={{ width: "100%" }}
                  >
                    <RiFlagLine size={18} /> End Day
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: Session panel and Daily Note */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "24px" }}
            >
              <SessionPanel
                logs={state.logs}
                status={state.status}
                currentTime={currentTime}
                onEdit={(idx) => setEditingSessionIdx(idx)}
                onDelete={(idx) => setPendingDeleteSessionIdx(idx)}
                onOpenOtModal={() => setShowOtMilestonesModal(true)}
              />

              <DailyNoteCard
                note={note}
                saveStatus={saveStatus}
                handleNoteChange={handleNoteChange}
              />

              <TodayNotificationsCard
                customNotifications={state.customNotifications || []}
                addCustomNotification={addCustomNotification}
                deleteCustomNotification={deleteCustomNotification}
              />
            </div>
          </div>
        )}
      </div>

      {/* OT Milestones Modal */}
      {showOtMilestonesModal && (
        <OtMilestonesModal
          onClose={() => setShowOtMilestonesModal(false)}
          milestones={computeOtMilestones(
            totalWork,
            state.targetWorkMs,
            currentTime,
            state.status === "working",
            timeFormat,
          )}
          currentOtMinutes={getOtMinutes(totalWork, state.targetWorkMs)}
        />
      )}

      {/* Confirmation Modal for delete session */}
      {pendingDeleteSessionIdx !== null && (
        <ConfirmationModal
          title="Delete Session"
          message={`Are you sure you want to delete session ${pendingDeleteSessionIdx + 1}?`}
          confirmText="Delete"
          confirmBtnClass="btn-danger"
          onClose={() => setPendingDeleteSessionIdx(null)}
          onConfirm={() => {
            deleteSession(pendingDeleteSessionIdx);
            setPendingDeleteSessionIdx(null);
          }}
        />
      )}

      {/* Confirmation Modal for clear all sessions */}
      {isConfirmingClearToday && (
        <ConfirmationModal
          title="Clear Today's Logs"
          message="Are you sure you want to clear ALL work logs for today? This cannot be undone."
          confirmText="Clear Today"
          confirmBtnClass="btn-danger"
          onClose={() => setIsConfirmingClearToday(false)}
          onConfirm={() => {
            clearToday();
            setIsConfirmingClearToday(false);
          }}
        />
      )}
    </>
  );
}
