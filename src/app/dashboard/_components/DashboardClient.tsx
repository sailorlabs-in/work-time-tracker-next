"use client";

import { useEffect, useState } from "react";
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
  RiRefreshLine,
  RiAlertLine,
  RiEdit2Line,
} from "@remixicon/react";
import OfflineBanner from "@/components/OfflineBanner";

interface UserProfile {
  timeFormat?: string;
  workHours?: number;
  workMinutes?: number;
  breakMinutes?: number;
}

interface DashboardClientProps {
  initialTimerState: TimerState | null;
  userProfile: UserProfile | null;
}

// ─── Helpers ─────────────────────────────────────────────────
function timeStrToMs(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
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

// ─── Build tabular session rows from log ─────────────────────
interface SessionRow {
  punchIn: number;
  punchOut: number | null;
}

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
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
      >
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
              <RiPlayFill size={18} />Start time
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Terminate Previous Timer ──────────────────────────
interface TerminateTimerModalProps {
  startTime: number;
  onClose: () => void;
  onSubmit: (endTimeMs: number) => Promise<{ success: boolean; error?: string }>;
}

function TerminateTimerModal({
  startTime,
  onClose,
  onSubmit,
}: TerminateTimerModalProps) {
  // Default to 11:59 PM of the start date
  const startDate = new Date(startTime);
  const defaultEnd = new Date(startDate);
  defaultEnd.setHours(23, 59, 0, 0);

  const formatDatetimeLocal = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const [endTime, setEndTime] = useState(formatDatetimeLocal(defaultEnd));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endMs = new Date(endTime).getTime();
    if (endMs <= startTime) {
      setError("End time must be after the session start time.");
      setLoading(false);
      return;
    }
    if (endMs > Date.now()) {
      setError("End time cannot be in the future.");
      setLoading(false);
      return;
    }

    const result = await onSubmit(endMs);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Failed to terminate timer.");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-centered">
          <span className="modal-icon">
            <RiAlertLine size={24} />
          </span>
          <h2>Terminate Previous Timer</h2>
          <p className="modal-subtitle">
            Your timer from{" "}
            {startDate.toLocaleDateString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}{" "}
            is still running. When did you actually stop working?
          </p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="terminateEndTime">Actual Stop Time</label>
            <input
              id="terminateEndTime"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              max={formatDatetimeLocal(new Date())}
              required
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-danger"
              disabled={loading}
            >
              <RiCheckLine size={18} />
              {loading ? "Terminating..." : "Terminate & Reset"}
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
  onEdit,
  onDelete,
}: {
  logs: TimerLog[];
  status: TimerStatus;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const rows = buildSessionRows(logs, status);

  return (
    <div className="session-panel glass-card animate-in">
      <div className="session-panel-header">
        <RiTimeLine className="session-panel-icon" size={20} />
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
              : Date.now() - row.punchIn;
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
  const {
    state,
    totalWork,
    totalBreak,
    remainingWork,
    remainingBreak,
    isOvertime,
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
    formatTime: ft,
  } = useWorkTimer(initialTimerState);

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

  const [showBreakModal, setShowBreakModal] = useState(false);
  const [showLatePunchInModal, setShowLatePunchInModal] = useState(false);
  const [showLatePunchOutModal, setShowLatePunchOutModal] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [editingSessionIdx, setEditingSessionIdx] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const updateTime = () => {
      const now = Date.now();
      setTimeStr(
        new Date(now).toLocaleTimeString([], { hour12: timeFormat === "12h" }),
      );

      if (remainingWork) {
        const targetTime = now + remainingWork;
        setLeaveTimeStr(
          new Date(targetTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          }),
        );
        setEarlyLeaveTimeStr(
          new Date(targetTime - 29 * 60000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          }),
        );
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
  }, [remainingWork, state.startTime, lastSynced]);

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
    const punchOutMs = timeStrToMs(punchOutStr);
    const punchInMs = timeStrToMs(punchInStr);
    const r = addHistoricalBreak(punchOutMs, punchInMs);
    if (!r.success) return r.error ?? "Failed to add break.";
    setShowBreakModal(false);
    return null;
  };

  const handleLatePunchOut = (punchOutStr: string): string | null => {
    if (state.status !== "working") return "You are not currently working.";
    const punchOutMs = timeStrToMs(punchOutStr);
    if (punchOutMs > Date.now()) return "Stop time cannot be in the future.";
    const r = punchToggle(punchOutMs);
    if (!r.success) return r.error ?? "Failed to stop time.";
    setShowLatePunchOutModal(false);
    return null;
  };

  const handleLatePunchIn = (punchInStr: string): string | null => {
    if (state.status !== "break") return "You are not currently on break.";
    const punchInMs = timeStrToMs(punchInStr);
    if (punchInMs > Date.now()) return "Punch-In time cannot be in the future.";
    const r = punchToggle(punchInMs);
    if (!r.success) return r.error ?? "Failed to punch in.";
    setShowLatePunchInModal(false);
    return null;
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
      {showTerminateModal && state.startTime && (
        <TerminateTimerModal
          startTime={state.startTime}
          onClose={() => setShowTerminateModal(false)}
          onSubmit={async (endTimeMs) => {
            const result = await terminatePreviousTimer(endTimeMs);
            if (result.success) setShowTerminateModal(false);
            return result;
          }}
        />
      )}
      {editingSessionIdx !== null && (
        <EditSessionModal
          session={
            buildSessionRows(state.logs, state.status)[editingSessionIdx]
          }
          index={editingSessionIdx}
          onClose={() => setEditingSessionIdx(null)}
          onSubmit={(inStr, outStr) => {
            updateSession(
              editingSessionIdx,
              timeStrToMs(inStr),
              outStr ? timeStrToMs(outStr) : null,
            );
            setEditingSessionIdx(null);
          }}
        />
      )}

      <div className={`main-content${state.isActive ? " dashboard-page" : ""}`}>
        {/* Stale Timer Banner */}
        {isStaleTimer && state.startTime && (
          <div className="stale-timer-banner animate-in">
            <div className="stale-timer-content">
              <RiAlertLine size={22} />
              <div className="stale-timer-text">
                <strong>Timer still running from{" "}
                  {new Date(state.startTime).toLocaleDateString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </strong>
                <span>You forgot to stop your timer. Terminate it to start a new day.</span>
              </div>
            </div>
            <button
              className="btn-terminate"
              onClick={() => setShowTerminateModal(true)}
            >
              <RiAlertLine size={16} /> Terminate Previous Timer
            </button>
          </div>
        )}

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
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    className={`status-badge ${state.status === "working" ? "working" : "on-break"}`}
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

              {!isOvertime && (
                <div className="leave-time-display">
                  <span className="leave-time-label">You can leave at </span>
                  <span
                    className="leave-time-value mono"
                    title={`Early leave: ${earlyLeaveTimeStr}`}
                  >
                    {leaveTimeStr}
                  </span>
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
                <div className="stat-card">
                  <span className="stat-label">Worked</span>
                  <span className="stat-value mono">
                    {formatShortTime(totalWork)}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Break Used</span>
                  <span className="stat-value mono">
                    {formatShortTime(totalBreak)}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Break Left</span>
                  <span
                    className={`stat-value mono ${remainingBreak <= 0 ? "danger" : ""}`}
                  >
                    {formatShortTime(Math.max(0, remainingBreak))}
                  </span>
                </div>
                <div className="stat-card">
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
                <div className="danger-zone-header">
                  <RiErrorWarningLine size={20} />
                  <span className="danger-zone-title">Danger Zone</span>
                </div>
                <div className="danger-actions">
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to clear ALL work logs for today? This cannot be undone.",
                        )
                      ) {
                        clearToday();
                      }
                    }}
                    className="btn-danger-outline"
                  >
                    <RiDeleteBinLine size={18} /> Clear Today
                  </button>
                  <button onClick={resetDay} className="btn-danger">
                    <RiRefreshLine size={18} /> Reset Day
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: Session panel */}
            <SessionPanel
              logs={state.logs}
              status={state.status}
              onEdit={(idx) => setEditingSessionIdx(idx)}
              onDelete={(idx) => {
                if (window.confirm("Are you sure you want to delete this session?")) {
                  deleteSession(idx);
                }
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
