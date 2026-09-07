"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  RiBriefcaseLine,
  RiCupLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiCheckboxCircleLine,
  RiDeleteBinLine,
  RiArrowRightLine,
  RiEditLine,
  RiAddLine,
  RiTimeLine,
} from "@remixicon/react";
import { WeekendPolicyData, DEFAULT_WEEKEND_POLICY, isWeekendOffDay } from "@/lib/weekendPolicy";

// ─── Types ─────────────────────────────────────────────────────────────────

interface WorkSession {
  id: string;
  punchIn: string; // "HH:mm"
  punchOut: string; // "HH:mm"
}

function genId() {
  return Math.random().toString(36).slice(2);
}

function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface WorkLog {
  id: string;
  date: string;
  punchIn: string;
  punchOut: string | null;
  totalHours: number | null;
  breakMinutes: number;
  status: string;
  notes: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  extendedProps: {
    log: WorkLog;
    type: "work" | "break";
    isActive?: boolean;
    previousLogId?: string;
    nextLogId?: string;
  };
}

interface TimelineItem {
  key: string;
  type: "work" | "break";
  start: string;
  end: string | null;
  durationMs: number;
  isActive?: boolean;
  logId?: string;
  previousLogId?: string;
  nextLogId?: string;
  position: "first" | "middle" | "last" | "only";
}

interface Props {
  date: string; // YYYY-MM-DD
  events: CalendarEvent[];
  timeFormat: string;
  workDurationMs?: number;
  holiday?: { name: string; durationMinutes: number | null };
  note?: string;
  weekendPolicy?: WeekendPolicyData;
  onClose: () => void;
  onRefresh: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtT(iso: string | null | undefined, format: string): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: format === "12h",
  });
}

function fmtDur(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DayDetailModal({
  date,
  events,
  timeFormat,
  workDurationMs = 8 * 3600000,
  holiday,
  note,
  weekendPolicy = DEFAULT_WEEKEND_POLICY,
  onClose,
  onRefresh,
}: Props) {
  const [isClearingDay, setIsClearingDay] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Notes state
  const [localNote, setLocalNote] = useState(note || "");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    setLocalNote(note || "");
  }, [note]);

  const handleSaveNote = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setIsSavingNote(true);

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          note: localNote,
        }),
      });

      if (res.ok) {
        setSuccessMsg("Note saved successfully.");
        setIsEditingNote(false);
        onRefresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error || "Failed to save note.");
      }
    } catch {
      setErrorMsg("Network error trying to save note.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const executeClearDay = useCallback(async () => {
    setErrorMsg("");
    setSuccessMsg("");
    setIsClearingDay(true);

    try {
      const todayDateStr = new Date().toLocaleDateString("en-CA");
      const isToday = date === todayDateStr;

      const res = await fetch("/api/worklog/delete-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear-day",
          date,
          isToday,
        }),
      });

      if (res.ok) {
        setSuccessMsg(
          isToday
            ? "Completed sessions cleared."
            : "All sessions for this day cleared."
        );
        setIsConfirmingClear(false);
        onRefresh();
        setTimeout(onClose, 900);
      } else {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error || "Failed to clear day entries.");
        setIsConfirmingClear(false);
      }
    } catch {
      setErrorMsg("Network error. Please check your connection.");
      setIsConfirmingClear(false);
    } finally {
      setIsClearingDay(false);
    }
  }, [date, onRefresh, onClose]);

  // ── Build timeline ──────────────────────────────────────────

  const dayEvents = events
    .filter((e) => e.start.startsWith(date))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const rawTimeline = dayEvents.map((e) => {
    const startMs = new Date(e.start).getTime();
    const endMs = e.end ? new Date(e.end).getTime() : Date.now();
    return {
      key: e.id,
      type: e.extendedProps.type,
      start: e.start,
      end: e.end || null,
      durationMs: Math.max(0, endMs - startMs),
      isActive: e.extendedProps.isActive,
      logId:
        e.extendedProps.type === "work" ? e.extendedProps.log.id : undefined,
      previousLogId: e.extendedProps.previousLogId,
      nextLogId: e.extendedProps.nextLogId,
    };
  });

  const workItems = rawTimeline.filter((t) => t.type === "work");
  const timeline: TimelineItem[] = rawTimeline.map((item) => {
    if (item.type === "break") return { ...item, position: "middle" as const };
    const workIdx = workItems.findIndex((w) => w.key === item.key);
    const total = workItems.length;
    let position: TimelineItem["position"] = "only";
    if (total > 1) {
      if (workIdx === 0) position = "first";
      else if (workIdx === total - 1) position = "last";
      else position = "middle";
    }
    return { ...item, position };
  });

  const totalWork = timeline
    .filter((t) => t.type === "work")
    .reduce((s, t) => s + t.durationMs, 0);
  const totalBreak = timeline
    .filter((t) => t.type === "break")
    .reduce((s, t) => s + t.durationMs, 0);

  let overtimeMs = 0;
  let earlyMs = 0;
  const hasActiveWork = timeline.some((t) => t.isActive && t.type === "work");

  const [year, month, day] = date.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const isOffDay = isWeekendOffDay(dateObj, weekendPolicy);

  const isFullDayHoliday = holiday && holiday.durationMinutes === null;

  const todayDateStr = new Date().toLocaleDateString("en-CA");
  const isToday = date === todayDateStr;
  const hasDeletableSessions = timeline.some(
    (item) => !isToday || !item.isActive
  );

  if (totalWork > 0) {
    if (isOffDay || isFullDayHoliday) {
      overtimeMs = totalWork;
    } else {
      let effectiveWorkDurationMs = workDurationMs;

      if (holiday && holiday.durationMinutes !== null) {
        effectiveWorkDurationMs = Math.max(0, workDurationMs - (holiday.durationMinutes * 60000));
      }

      if (totalWork > effectiveWorkDurationMs) {
        overtimeMs = totalWork - effectiveWorkDurationMs;
      } else if (!hasActiveWork && totalWork < effectiveWorkDurationMs) {
        earlyMs = effectiveWorkDurationMs - totalWork;
      }
    }
  }

  // Rounding rules
  const overtimeMin = Math.floor(overtimeMs / 60000);
  if (overtimeMin >= 30) {
    const roundedOvertimeMin = Math.floor((overtimeMin - 15) / 30) * 30 + 30;
    overtimeMs = roundedOvertimeMin * 60000;
  } else {
    overtimeMs = 0;
  }

  const earlyMin = Math.floor(earlyMs / 60000);
  if (earlyMin > 30) {
    const roundedEarlyMin = Math.floor((earlyMin - 15) / 30) * 30 + 30;
    earlyMs = roundedEarlyMin * 60000;
  } else {
    earlyMs = 0;
  }

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const [isEditingSessions, setIsEditingSessions] = useState(false);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [isSavingSessions, setIsSavingSessions] = useState(false);

  const handleStartEditSessions = () => {
    setErrorMsg("");
    setSuccessMsg("");

    const completedWork = workItems
      .filter((w) => !w.isActive)
      .map((w) => {
        const inD = new Date(w.start);
        const outD = w.end ? new Date(w.end) : inD;
        const inH = String(inD.getHours()).padStart(2, "0");
        const inM = String(inD.getMinutes()).padStart(2, "0");
        const outH = String(outD.getHours()).padStart(2, "0");
        const outM = String(outD.getMinutes()).padStart(2, "0");
        return {
          id: w.logId || genId(),
          punchIn: `${inH}:${inM}`,
          punchOut: `${outH}:${outM}`,
        };
      });

    if (completedWork.length === 0) {
      setSessions([
        { id: genId(), punchIn: "09:00", punchOut: "18:00" },
      ]);
    } else {
      setSessions(completedWork);
    }
    setIsEditingSessions(true);
  };

  const addSession = () => {
    const last = sessions[sessions.length - 1];
    const lastOutMin = timeToMinutes(last?.punchOut || "18:00");
    const newInMin = lastOutMin + 30;
    const newInH = Math.floor(newInMin / 60);
    const newInM = newInMin % 60;
    const newInStr = `${String(Math.min(newInH, 23)).padStart(2, "0")}:${String(newInM).padStart(2, "0")}`;
    const newOutMin = Math.min(newInMin + 60, 23 * 60 + 59);
    const newOutH = Math.floor(newOutMin / 60);
    const newOutM = newOutMin % 60;
    const newOutStr = `${String(newOutH).padStart(2, "0")}:${String(newOutM).padStart(2, "0")}`;
    setSessions([
      ...sessions,
      { id: genId(), punchIn: newInStr, punchOut: newOutStr },
    ]);
  };

  const removeSession = (id: string) => {
    if (sessions.length === 1) return;
    setSessions(sessions.filter((s) => s.id !== id));
  };

  const updateSession = (
    id: string,
    field: "punchIn" | "punchOut",
    value: string,
  ) => {
    setSessions(
      sessions.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  };

  const editSummary = useMemo(() => {
    let workMs = 0;
    let breakMs = 0;
    sessions.forEach((s, i) => {
      const inMin = timeToMinutes(s.punchIn);
      const outMin = timeToMinutes(s.punchOut);
      if (outMin > inMin) workMs += (outMin - inMin) * 60000;
      const next = sessions[i + 1];
      if (next) {
        const gap = timeToMinutes(next.punchIn) - outMin;
        if (gap > 0) breakMs += gap * 60000;
      }
    });
    return { workMs, breakMs };
  }, [sessions]);

  const handleCancelEdit = () => {
    setIsEditingSessions(false);
    setErrorMsg("");
  };

  const handleSaveSessions = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s.punchIn || !s.punchOut) {
        setErrorMsg(`Session ${i + 1}: punch-in and punch-out are required.`);
        return;
      }
      if (timeToMinutes(s.punchOut) <= timeToMinutes(s.punchIn)) {
        setErrorMsg(`Session ${i + 1}: punch-out must be after punch-in.`);
        return;
      }
      if (i > 0) {
        const prev = sessions[i - 1];
        if (timeToMinutes(s.punchIn) < timeToMinutes(prev.punchOut)) {
          setErrorMsg(`Session ${i + 1} overlaps with session ${i}.`);
          return;
        }
      }
    }

    setIsSavingSessions(true);
    try {
      const sessionData = sessions.map((s) => {
        const punchIn = new Date(`${date}T${s.punchIn}:00`);
        const punchOut = new Date(`${date}T${s.punchOut}:00`);
        const totalHours = (punchOut.getTime() - punchIn.getTime()) / 3600000;
        return {
          punchIn: punchIn.toISOString(),
          punchOut: punchOut.toISOString(),
          totalHours: parseFloat(totalHours.toFixed(4)),
        };
      });

      const res = await fetch("/api/worklog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bulk",
          date,
          sessions: sessionData,
          replaceExisting: true,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error || "Failed to update sessions.");
        return;
      }

      setSuccessMsg("Day sessions updated successfully.");
      setIsEditingSessions(false);
      onRefresh();
    } catch {
      setErrorMsg("Something went wrong saving sessions. Please try again.");
    } finally {
      setIsSavingSessions(false);
    }
  };


  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card day-modal-card animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="day-modal-header">
          <div className="day-modal-title-block">
            <p className="day-modal-date">
              {displayDate}
              {holiday && holiday.durationMinutes === null && (
                <span className="dmt-chip dmt-holiday-full">
                  {holiday.name}
                </span>
              )}
              {isOffDay && !holiday && (
                <span className="dmt-chip dmt-holiday-full">
                  Work-Off
                </span>
              )}
              {holiday && holiday.durationMinutes !== null && (
                <span className="dmt-holiday-partial dmt-chip">
                  {holiday.name} ({Math.floor(holiday.durationMinutes / 60)}h {holiday.durationMinutes % 60}m)
                </span>
              )}
            </p>
            <div className="day-modal-totals">
              {totalWork > 0 && (
                <span className="dmt-chip dmt-work">
                  <RiBriefcaseLine size={16} /> {fmtDur(totalWork)} worked
                </span>
              )}
              {totalBreak > 0 && (
                <span className="dmt-chip dmt-break">
                  <RiCupLine size={16} /> {fmtDur(totalBreak)} break
                </span>
              )}
              {overtimeMs > 0 && (
                <span className="dmt-chip dmt-overtime">
                  Overtime ({fmtDur(overtimeMs)})
                </span>
              )}
              {earlyMs > 0 && (
                <span className="dmt-chip dmt-early">
                  Early going by ({fmtDur(earlyMs)})
                </span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <RiCloseLine size={20} />
          </button>
        </div>

        <div className="day-modal-scroll-body">
          {/* Messages */}
        {errorMsg && (
          <div className="dm-message dm-message-error">
            <RiErrorWarningLine className="dm-msg-icon" size={18} />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="dm-message dm-message-success">
            <RiCheckboxCircleLine className="dm-msg-icon" size={18} />
            <span>{successMsg}</span>
          </div>
        )}



        {/* Day Notes Section */}
        <div className="day-modal-notes-section">
          <div className="dm-notes-header">
            <span className="dm-notes-title">
              📝 Day Note
            </span>
            {!isEditingNote && (
              <button
                type="button"
                className="dm-notes-action-btn"
                onClick={() => setIsEditingNote(true)}
              >
                {localNote ? "Edit Note" : "Add Note"}
              </button>
            )}
          </div>

          {isEditingNote ? (
            <div className="dm-notes-edit-box">
              <textarea
                value={localNote}
                onChange={(e) => setLocalNote(e.target.value)}
                placeholder="Add note for this day..."
                className="dm-notes-textarea"
              />
              <div className="dm-notes-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small-action"
                  onClick={() => {
                    setLocalNote(note || "");
                    setIsEditingNote(false);
                  }}
                  disabled={isSavingNote}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-small-action"
                  onClick={handleSaveNote}
                  disabled={isSavingNote}
                >
                  {isSavingNote ? "Saving..." : "Save Note"}
                </button>
              </div>
            </div>
          ) : (
            <p className={`dm-notes-content ${localNote ? "has-note" : "empty"}`}>
              {localNote || "No notes added for this day."}
            </p>
          )}
        </div>

        {/* Sessions Content: Editing Mode or Timeline View */}
        {isEditingSessions ? (
          <div className="day-modal-edit-panel">
            <div className="day-modal-section-header">
              <span className="dm-section-title">
                <RiEditLine size={16} /> Edit Day Sessions
              </span>
              <button
                type="button"
                className="btn-secondary btn-small-action"
                onClick={handleCancelEdit}
                disabled={isSavingSessions}
              >
                Cancel
              </button>
            </div>

            {hasActiveWork && (
              <div className="day-modal-active-notice">
                <RiErrorWarningLine size={18} />
                <span>
                  An active timer is currently running for today. It will remain active while you edit the completed sessions below.
                </span>
              </div>
            )}

            <div className="mep-sessions-label">Work Sessions</div>
            <div className="mep-sessions">
              {sessions.map((session, i) => (
                <div key={session.id}>
                  <div className="mep-session-row">
                    <div className="mep-session-num">{i + 1}</div>
                    <div className="mep-time-pair">
                      <div className="form-group">
                        <label>In</label>
                        <input
                          type="time"
                          value={session.punchIn}
                          onChange={(e) =>
                            updateSession(session.id, "punchIn", e.target.value)
                          }
                        />
                      </div>
                      <span className="mep-arrow">→</span>
                      <div className="form-group">
                        <label>Out</label>
                        <input
                          type="time"
                          value={session.punchOut}
                          onChange={(e) =>
                            updateSession(session.id, "punchOut", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    {sessions.length > 1 && (
                      <button
                        type="button"
                        className="mep-remove-btn"
                        onClick={() => removeSession(session.id)}
                        title="Remove session"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Break Indicator Between Sessions */}
                  {i < sessions.length - 1 && (() => {
                    const breakMin =
                      timeToMinutes(sessions[i + 1].punchIn) -
                      timeToMinutes(session.punchOut);
                    return (
                      <div className="mep-break-indicator">
                        <div className="mep-break-line" />
                        <span
                          className={`mep-break-label ${breakMin <= 0 ? "invalid" : ""}`}
                        >
                          ☕ Break ·{" "}
                          {breakMin > 0
                            ? fmtDur(breakMin * 60000)
                            : "⚠ invalid / overlap"}
                        </span>
                        <div className="mep-break-line" />
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="mep-add-session-btn"
              onClick={addSession}
              disabled={isSavingSessions}
            >
              + Add Another Session
            </button>

            {/* Live Summary */}
            {editSummary.workMs > 0 && (
              <div className="mep-summary">
                <div className="mep-summary-chip work">
                  <span>⏱ Work</span>
                  <strong className="mono">{fmtDur(editSummary.workMs)}</strong>
                </div>
                {editSummary.breakMs > 0 && (
                  <div className="mep-summary-chip break">
                    <span>☕ Break</span>
                    <strong className="mono">{fmtDur(editSummary.breakMs)}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="day-modal-edit-footer">
              <button
                type="button"
                className="btn-clear-day"
                onClick={() => setIsConfirmingClear(true)}
                disabled={!hasDeletableSessions || isSavingSessions || isClearingDay}
                title={`Clear all data recorded for ${date}`}
              >
                <span className="btn-clear-day-icon">
                  <RiDeleteBinLine size={16} />
                </span>
                <span>Clear All {date}&apos;s Data</span>
              </button>

              <div className="dm-edit-save-group">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCancelEdit}
                  disabled={isSavingSessions}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveSessions}
                  disabled={isSavingSessions}
                >
                  {isSavingSessions ? (
                    <span className="btn-loading">
                      <span className="spinner" />
                      Saving...
                    </span>
                  ) : (
                    "💾 Save Day Record"
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {timeline.length === 0 ? (
              <div className="day-modal-empty-state">
                <p className="day-modal-empty">No sessions recorded for this day.</p>
                <button
                  type="button"
                  className="btn-primary btn-empty-action"
                  onClick={handleStartEditSessions}
                >
                  <RiAddLine size={16} /> Add Day Record
                </button>
              </div>
            ) : (
              <>
                <div className="day-modal-section-header">
                  <span className="dm-section-title">
                    <RiTimeLine size={16} /> Work Sessions ({workItems.length})
                  </span>
                  <button
                    type="button"
                    className="btn-edit-sessions"
                    onClick={handleStartEditSessions}
                  >
                    <RiEditLine size={14} /> Edit Sessions
                  </button>
                </div>

                <div className="day-timeline">
                  {timeline.map((item, idx) => {
                    const isLast = idx === timeline.length - 1;

                    return (
                      <div
                        key={item.key}
                        className={[
                          "timeline-item",
                          `timeline-item-${item.type}`,
                          item.isActive ? "timeline-active" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <div className="timeline-dot-col">
                          <div className="timeline-dot" />
                          {!isLast && <div className="timeline-connector" />}
                        </div>

                        <div className="timeline-body">
                          <div className="timeline-times mono">
                            <span>{fmtT(item.start, timeFormat)}</span>
                            <RiArrowRightLine className="timeline-arrow" size={14} />
                            <span>
                              {item.isActive ? (
                                <span className="session-ongoing">now</span>
                              ) : (
                                fmtT(item.end, timeFormat)
                              )}
                            </span>
                          </div>

                          <div className="timeline-meta-row">
                            <div className="tl-meta-left">
                              <span className={`tl-badge tl-badge-${item.type}`}>
                                {item.type === "work" ? (
                                  <>
                                    <RiBriefcaseLine size={14} /> Work
                                  </>
                                ) : (
                                  <>
                                    <RiCupLine size={14} /> Break
                                  </>
                                )}
                              </span>

                              <span className="tl-duration mono">
                                {fmtDur(item.durationMs)}
                                {item.isActive && (
                                  <span
                                    className="tl-active-dot"
                                    title="Active session"
                                  />
                                )}
                              </span>
                            </div>
                          </div>

                          {item.type === "work" && (
                            <div className="tl-position-label">
                              {item.position === "only" && "only session"}
                              {item.position === "first" && "first session"}
                              {item.position === "middle" && "middle session"}
                              {item.position === "last" &&
                                (item.isActive ? "active" : "last session")}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

          </>
        )}
        </div>
      </div>

      {/* Clear Day confirmation modal */}
      {isConfirmingClear && (
        <ConfirmationModal
          title={`Clear All ${date}'s Data`}
          message={
            date === new Date().toLocaleDateString("en-CA")
              ? "Are you sure you want to clear all completed sessions for today? Your active timer will not be affected."
              : `Are you sure you want to clear all sessions for ${displayDate}?`
          }
          confirmText={`Clear All ${date}'s Data`}
          confirmBtnClass="btn-modal-danger"
          onClose={() => setIsConfirmingClear(false)}
          onConfirm={executeClearDay}
          isLoading={isClearingDay}
        />
      )}
    </div>
  );
}

interface ConfirmationModalProps {
  title: string;
  message: string;
  confirmText: string;
  confirmBtnClass?: string;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmationModal({
  title,
  message,
  confirmText,
  confirmBtnClass = "btn-modal-danger",
  onClose,
  onConfirm,
  isLoading = false,
}: ConfirmationModalProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-overlay confirmation-modal-overlay" onClick={onClose}>
      <div
        className="modal-card confirmation-modal-card animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header modal-header-centered confirmation-modal-header">
          <h2>{title}</h2>
        </div>
        <div className="modal-body confirmation-modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer confirmation-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmBtnClass}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="btn-loading">
                <span className="spinner" />
                Processing...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
