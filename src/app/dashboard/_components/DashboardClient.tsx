"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
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
  RiSettings4Line,
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
  earlyGoingTime?: string | null;
}

function computeOtMilestones(
  totalWorkMs: number,
  targetWorkMs: number,
  currentTime: number,
  isWorking: boolean,
  timeFormat: "12h" | "24h",
  plannedBreakMinutes: number = 0,
  isBreak: boolean = false,
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

  const plannedBreakMs = Math.max(0, plannedBreakMinutes) * 60000;

  return tiers.map((tier) => {
    const isPassed = totalWorkMs >= tier.thresholdMs;
    let clockTime: string | null = null;

    if (isPassed) {
      // Already passed — show when it was achieved (approximate)
      clockTime = "Completed";
    } else if (isWorking) {
      // Only calculate future time when currently working
      const msRemaining = tier.thresholdMs - totalWorkMs;
      const futureMs = currentTime + msRemaining + plannedBreakMs;
      clockTime = new Date(futureMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: timeFormat === "12h",
      });
    } else if (isBreak) {
      // On break - calculate projected time assuming resuming now
      const msRemaining = tier.thresholdMs - totalWorkMs;
      const futureMs = currentTime + msRemaining + plannedBreakMs;
      const formatted = new Date(futureMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: timeFormat === "12h",
      });
      clockTime = `~${formatted}`;
    } else {
      // Day not started
      clockTime = "--:--";
    }

    let earlyGoingTime: string | null = null;
    if (tier.otMinutes === 0 && !isPassed && (isWorking || isBreak)) {
      const msRemaining = tier.thresholdMs - totalWorkMs;
      const futureMs = currentTime + msRemaining + plannedBreakMs;
      const earlyMs = futureMs - 30 * 60000;
      earlyGoingTime = new Date(earlyMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: timeFormat === "12h",
      });
    }

    return { ...tier, clockTime, isPassed, earlyGoingTime };
  });
}

// ─── Modal: OT Milestones ────────────────────────────────────
interface OtMilestonesModalProps {
  onClose: () => void;
  totalWorkMs: number;
  targetWorkMs: number;
  currentTime: number;
  isWorking: boolean;
  isBreak: boolean;
  timeFormat: "12h" | "24h";
  currentOtMinutes: number;
}

function OtMilestonesModal({
  onClose,
  totalWorkMs,
  targetWorkMs,
  currentTime,
  isWorking,
  isBreak,
  timeFormat,
  currentOtMinutes,
}: OtMilestonesModalProps) {
  const [breakHours, setBreakHours] = useState<number>(0);
  const [breakMinutes, setBreakMinutes] = useState<number>(0);
  const [showCustom, setShowCustom] = useState(false);
  const plannedBreakMinutes = breakHours * 60 + breakMinutes;

  const milestones = useMemo(
    () =>
      computeOtMilestones(
        totalWorkMs,
        targetWorkMs,
        currentTime,
        isWorking,
        timeFormat,
        plannedBreakMinutes,
        isBreak,
      ),
    [totalWorkMs, targetWorkMs, currentTime, isWorking, timeFormat, plannedBreakMinutes, isBreak]
  );

  const standardPresets = [
    { label: "0m", h: 0, m: 0 },
    { label: "15m", h: 0, m: 15 },
    { label: "30m", h: 0, m: 30 },
    { label: "45m", h: 0, m: 45 },
    { label: "1h", h: 1, m: 0 },
  ];

  const matchedPreset = standardPresets.find(
    (opt) => opt.h === breakHours && opt.m === breakMinutes
  );
  const isCustomActive = showCustom || !matchedPreset;

  const formatBreakLabel = () => {
    if (breakHours > 0 && breakMinutes > 0) return `${breakHours}h ${breakMinutes}m`;
    if (breakHours > 0) return `${breakHours}h`;
    return `${breakMinutes}m`;
  };

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

        {/* Break Simulation Card — Hours & Minutes format */}
        <div className="ot-break-sim-card">
          <div className="ot-break-sim-header">
            <div className="ot-break-sim-title">
              <RiCupLine size={15} />
              <span>Simulate Break</span>
            </div>
            {plannedBreakMinutes > 0 && (
              <div className="ot-break-sim-badge-wrap">
                <span className="ot-break-sim-badge">
                  +{formatBreakLabel()} added
                </span>
                <button
                  type="button"
                  className="ot-break-reset-btn"
                  onClick={() => {
                    setBreakHours(0);
                    setBreakMinutes(0);
                    setShowCustom(false);
                  }}
                  title="Reset to 0"
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          <div className="ot-break-segmented">
            {standardPresets.map((opt) => {
              const isSelected = !showCustom && breakHours === opt.h && breakMinutes === opt.m;
              return (
                <button
                  key={opt.label}
                  type="button"
                  className={`ot-break-seg-btn${isSelected ? " active" : ""}`}
                  onClick={() => {
                    setBreakHours(opt.h);
                    setBreakMinutes(opt.m);
                    setShowCustom(false);
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`ot-break-seg-btn${isCustomActive ? " active" : ""}`}
              onClick={() => {
                if (showCustom) {
                  if (!matchedPreset) {
                    setBreakHours(0);
                    setBreakMinutes(0);
                  }
                  setShowCustom(false);
                } else {
                  setShowCustom(true);
                }
              }}
            >
              Custom
            </button>
          </div>

          {isCustomActive && (
            <div className="ot-break-custom-row">
              <span className="ot-break-custom-label">Custom break:</span>
              <div className="ot-break-combined-wrap">
                <div className="ot-break-labels-row">
                  <span className="ot-break-unit-label">hr</span>
                  <span className="ot-break-unit-label">min</span>
                </div>
                <div className="ot-break-combined-stepper">
                  <button
                    type="button"
                    className="ot-stepper-btn"
                    disabled={breakHours <= 0 && breakMinutes <= 0}
                    onClick={() => {
                      if (breakMinutes >= 5) {
                        setBreakMinutes((m) => m - 5);
                      } else if (breakHours > 0) {
                        setBreakHours((h) => h - 1);
                        setBreakMinutes(55);
                      } else {
                        setBreakMinutes(0);
                      }
                    }}
                    title="Decrease 5 minutes"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="12"
                    value={breakHours}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setBreakHours(isNaN(val) ? 0 : Math.max(0, Math.min(val, 12)));
                    }}
                    className="ot-stepper-input mono"
                    aria-label="Break hours"
                  />
                  <span className="ot-stepper-sep">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="5"
                    value={breakMinutes}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setBreakMinutes(isNaN(val) ? 0 : Math.max(0, Math.min(val, 59)));
                    }}
                    className="ot-stepper-input mono"
                    aria-label="Break minutes"
                  />
                  <button
                    type="button"
                    className="ot-stepper-btn"
                    onClick={() => {
                      if (breakMinutes + 5 >= 60) {
                        setBreakHours((h) => Math.min(12, h + 1));
                        setBreakMinutes((m) => (m + 5) % 60);
                      } else {
                        setBreakMinutes((m) => m + 5);
                      }
                    }}
                    title="Increase 5 minutes"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ot-milestones-list">
          {milestones.map((m, i) => {
            const isWorkCompleteRow = i === 0;
            const rowTooltip = isWorkCompleteRow && m.earlyGoingTime
              ? `Early going on: ${m.earlyGoingTime}`
              : undefined;

            return (
              <div
                key={i}
                className={`ot-milestone-row${
                  m.isPassed ? " ot-milestone-passed" : ""
                }${isWorkCompleteRow ? " ot-milestone-work-complete" : ""}`}
                title={rowTooltip}
              >
                <div className="ot-milestone-indicator">
                  <span
                    className={`ot-milestone-dot${m.isPassed ? " passed" : ""}`}
                  />
                  {i < milestones.length - 1 && (
                    <span className="ot-milestone-line" />
                  )}
                </div>
                <div className="ot-milestone-info" title={rowTooltip}>
                  <span className="ot-milestone-label" title={rowTooltip}>{m.label}</span>
                  <span className="ot-milestone-sublabel">
                    {i === 0
                      ? formatShortTime(m.thresholdMs) + " worked"
                      : `+${formatShortTime(m.thresholdMs - milestones[0].thresholdMs)} after completion`}
                  </span>
                </div>
                <div className="ot-milestone-time mono" title={rowTooltip}>
                  {m.isPassed ? (
                    <span className="ot-milestone-check">
                      <RiCheckLine size={16} />
                    </span>
                  ) : (
                    <div className="ot-milestone-time-val">
                      <span>{m.clockTime}</span>
                      {plannedBreakMinutes > 0 && (
                        <span className="ot-milestone-adjusted-tag">+{formatBreakLabel()}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

  const workHours = userProfile?.workHours ?? 8;
  const workMinutes = userProfile?.workMinutes ?? 0;
  const breakMinutes = userProfile?.breakMinutes ?? 60;
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
  const [showOtMilestonesModal, setShowOtMilestonesModal] = useState(false);

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
          <div className="glass-card setup-card animate-in">
            <div className="setup-hero-badge">
              <RiRocketLine size={26} />
            </div>
            <div className="card-header">
              <h1 className="gradient-text">Ready to Begin?</h1>
              <p className="subtitle">Start your work session and track your progress in real-time.</p>
            </div>

            <div className="setup-targets-card">
              <div className="setup-target-item">
                <span className="setup-target-label">Target Work</span>
                <span className="setup-target-val mono">
                  {workHours}h {workMinutes > 0 ? `${workMinutes}m` : ""}
                </span>
              </div>
              <div className="setup-target-divider" />
              <div className="setup-target-item">
                <span className="setup-target-label">Allocated Break</span>
                <span className="setup-target-val mono">{breakMinutes}m</span>
              </div>
            </div>

            <Link href="/settings" className="setup-settings-link">
              <RiSettings4Line size={15} />
              <span>Change daily targets in Settings</span>
            </Link>

            <div className="form-group entry-time-group">
              <div className="entry-time-header">
                <label htmlFor="entryTime">Starting Time (Punch-In)</label>
                <button
                  type="button"
                  className="btn-now-pill"
                  onClick={() => setEntryTime(nowTimeStr())}
                  title="Set to current local time"
                >
                  Set to Now
                </button>
              </div>
              <input
                type="time"
                id="entryTime"
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                className="entry-time-input"
              />
            </div>

            <button onClick={handleStartDay} className="btn-primary btn-full btn-start-day">
              <RiPlayFill size={20} /> Start Day
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
                  <span className="leave-time-label">
                    You can leave at{" "}
                  </span>
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
                <div className="stat-card mb-center">
                  <div className="stat-header">
                    <span className="stat-label">Worked</span>
                    <RiTimerLine size={16} className="stat-icon" />
                  </div>
                  <span className="stat-value mono">
                    {formatShortTime(totalWork)}
                  </span>
                </div>
                <div className="stat-card mb-center">
                  <div className="stat-header">
                    <span className="stat-label">Break Used</span>
                    <RiCupLine size={16} className="stat-icon" />
                  </div>
                  <span className="stat-value mono">
                    {formatShortTime(totalBreak)}
                  </span>
                </div>
                <div className="stat-card mb-center">
                  <div className="stat-header">
                    <span className="stat-label">Break Left</span>
                    <RiTimeLine size={16} className="stat-icon" />
                  </div>
                  <span
                    className={`stat-value mono ${remainingBreak <= 0 ? "danger" : ""}`}
                  >
                    {formatShortTime(Math.max(0, remainingBreak))}
                  </span>
                </div>
                <div className="stat-card mb-center">
                  <div className="stat-header">
                    <span className="stat-label">Entry Time</span>
                    <RiCalendarLine size={16} className="stat-icon" />
                  </div>
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
                  <div className="danger-zone-title-wrap">
                    <RiErrorWarningLine size={18} />
                    <span className="danger-zone-title">Danger Zone</span>
                  </div>
                  <button
                    onClick={() => setIsConfirmingClearToday(true)}
                    className="btn-danger-icon"
                    title="Clear Today's Logs"
                  >
                    <RiDeleteBinLine size={16} />
                  </button>
                </div>
                <div className="danger-actions">
                  <button
                    onClick={resetDay}
                    className="btn-danger"
                  >
                    <RiFlagLine size={18} /> End Day
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: Session panel and Daily Note */}
            <div className="dashboard-sidebar">
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
          totalWorkMs={totalWork}
          targetWorkMs={state.targetWorkMs}
          currentTime={currentTime}
          isWorking={state.status === "working"}
          isBreak={state.status === "break"}
          timeFormat={timeFormat}
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
