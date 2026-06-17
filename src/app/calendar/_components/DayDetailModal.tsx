"use client";

import { useState, useCallback, useEffect } from "react";
import {
  RiBriefcaseLine,
  RiCupLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiCheckboxCircleLine,
  RiDeleteBinLine,
  RiArrowRightLine,
} from "@remixicon/react";

// ─── Types ─────────────────────────────────────────────────────────────────

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

interface PendingDelete {
  item: TimelineItem;
}

interface Props {
  date: string; // YYYY-MM-DD
  events: CalendarEvent[];
  timeFormat: string;
  workDurationMs?: number;
  holiday?: { name: string; durationMinutes: number | null };
  note?: string;
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
  onClose,
  onRefresh,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
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
    setDeletingId("clear-day-action");

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
      setDeletingId(null);
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
  const dayOfWeek = dateObj.getDay();
  const dateNum = dateObj.getDate();
  const weekNumber = Math.ceil(dateNum / 7);
  const isOffDay = dayOfWeek === 0 || (dayOfWeek === 6 && [1, 3, 5].includes(weekNumber));

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
      let applyEgCooldown = true;

      if (holiday && holiday.durationMinutes !== null) {
        effectiveWorkDurationMs = Math.max(0, workDurationMs - (holiday.durationMinutes * 60000));
        applyEgCooldown = false;
      }

      if (totalWork > effectiveWorkDurationMs) {
        overtimeMs = totalWork - effectiveWorkDurationMs;
      } else if (
        !hasActiveWork &&
        (applyEgCooldown
          ? totalWork < effectiveWorkDurationMs - 30 * 60000
          : totalWork < effectiveWorkDurationMs)
      ) {
        earlyMs = effectiveWorkDurationMs - totalWork;
      }
    }
  }

  if (overtimeMs <= 30 * 60000) {
    overtimeMs = 0;
  }

  // ── Delete handler ───────────────────────────────────────────

  const executeDelete = useCallback(
    async (item: TimelineItem) => {
      setErrorMsg("");
      setSuccessMsg("");
      const deletingKey =
        item.type === "break"
          ? `break-${item.previousLogId}-${item.nextLogId}`
          : item.logId!;
      setDeletingId(deletingKey);

      try {
        const body =
          item.type === "break"
            ? {
                action: "delete-break",
                previousLogId: item.previousLogId,
                nextLogId: item.nextLogId,
              }
            : { action: "delete-work", logId: item.logId };

        const res = await fetch("/api/worklog/delete-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          setSuccessMsg(
            item.type === "break"
              ? "Break removed — sessions merged!"
              : "Session deleted.",
          );
          setPendingDelete(null);
          onRefresh();
          setTimeout(onClose, 900);
        } else {
          const d = await res.json().catch(() => ({}));
          setErrorMsg(d.error || "Something went wrong. Please try again.");
          setPendingDelete(null);
        }
      } catch {
        setErrorMsg("Network error. Please check your connection.");
        setPendingDelete(null);
      } finally {
        setDeletingId(null);
      }
    },
    [onRefresh, onClose],
  );

  const handleDeleteClick = (item: TimelineItem) => {
    setErrorMsg("");
    setSuccessMsg("");
    setPendingDelete({ item });
  };

  const handleConfirm = () => {
    if (pendingDelete) executeDelete(pendingDelete.item);
  };

  const handleCancel = () => {
    setPendingDelete(null);
    setErrorMsg("");
  };

  // ── Confirmation copy ────────────────────────────────────────

  function getConfirmMessage(item: TimelineItem): string {
    if (item.type === "break") {
      const prevWork = timeline.find(
        (t) => t.type === "work" && t.logId === item.previousLogId,
      );
      const nextWork = timeline.find(
        (t) => t.type === "work" && t.logId === item.nextLogId,
      );
      const prevDur = prevWork ? fmtDur(prevWork.durationMs) : "?";
      const nextDur = nextWork
        ? nextWork.isActive
          ? "ongoing"
          : fmtDur(nextWork.durationMs)
        : "?";
      return `Remove this ${fmtDur(item.durationMs)} break and merge the surrounding sessions (${prevDur} + ${nextDur}) into one continuous work block?`;
    }
    if (item.position === "only")
      return `Delete the only work session for this day? All data for ${date} will be removed.`;
    if (item.position === "first")
      return `Delete the first work session (${fmtDur(item.durationMs)})? The day will start from the next session.`;
    if (item.position === "last")
      return item.isActive
        ? `End and delete the active session? This cannot be undone.`
        : `Delete the last work session (${fmtDur(item.durationMs)})? The day's records will be trimmed.`;

    const itemIdx = timeline.findIndex((t) => t.key === item.key);
    const prevBreak = itemIdx > 0 ? timeline[itemIdx - 1] : null;
    const nextBreak =
      itemIdx < timeline.length - 1 ? timeline[itemIdx + 1] : null;
    const newBreakMs =
      (prevBreak?.type === "break" ? prevBreak.durationMs : 0) +
      item.durationMs +
      (nextBreak?.type === "break" ? nextBreak.durationMs : 0);
    return `Delete this ${fmtDur(item.durationMs)} work session? The surrounding breaks will merge into a single ${fmtDur(newBreakMs)} break.`;
  }

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPunchIn, setEditPunchIn] = useState("");
  const [editPunchOut, setEditPunchOut] = useState("");

  const handleEditClick = (item: TimelineItem) => {
    setErrorMsg("");
    setSuccessMsg("");
    setPendingDelete(null);
    setDeletingId(null);
    
    setEditingId(item.logId!);
    setEditPunchIn(new Date(item.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    if (item.end) {
      setEditPunchOut(new Date(item.end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    } else {
      setEditPunchOut("");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setErrorMsg("");
  };

  const executeEdit = async (item: TimelineItem) => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!editPunchIn) {
      setErrorMsg("Punch in time cannot be empty.");
      return;
    }

    try {
      const originalStartDate = new Date(item.start);
      const newInTokens = editPunchIn.split(":");
      originalStartDate.setHours(Number(newInTokens[0]), Number(newInTokens[1]), 0, 0);

      let newOutDate: Date | null = null;
      let totalHoursInput: number | null = null;
      
      if (editPunchOut) {
        newOutDate = new Date(item.end || item.start);
        const newOutTokens = editPunchOut.split(":");
        newOutDate.setHours(Number(newOutTokens[0]), Number(newOutTokens[1]), 0, 0);

        if (newOutDate < originalStartDate) {
          setErrorMsg("Punch out time cannot be before punch in.");
          return;
        }

        const durationMs = newOutDate.getTime() - originalStartDate.getTime();
        totalHoursInput = parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2));
      }

      setDeletingId(item.logId!); 

      const res = await fetch("/api/worklog/update-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: item.logId,
          newPunchIn: originalStartDate.toISOString(),
          newPunchOut: newOutDate ? newOutDate.toISOString() : null,
          totalHours: totalHoursInput,
        }),
      });

      if (res.ok) {
        setSuccessMsg("Session updated successfully.");
        setEditingId(null);
        onRefresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error || "Failed to update session.");
      }
    } catch {
      setErrorMsg("Network error trying to update session.");
    } finally {
      setDeletingId(null);
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
        <div className="day-modal-notes-section" style={{
          marginTop: "12px",
          marginBottom: "12px",
          padding: "16px",
          borderRadius: "var(--radius-md)",
          background: "var(--slate-bg)",
          border: "1px solid var(--card-border)",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-main)", display: "flex", alignItems: "center", gap: "6px" }}>
              📝 Day Note
            </span>
            {!isEditingNote && (
              <button
                onClick={() => setIsEditingNote(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent-primary)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0
                }}
              >
                {localNote ? "Edit Note" : "Add Note"}
              </button>
            )}
          </div>

          {isEditingNote ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <textarea
                value={localNote}
                onChange={(e) => setLocalNote(e.target.value)}
                placeholder="Add note for this day..."
                style={{
                  padding: "10px",
                  fontSize: "0.85rem",
                  minHeight: "70px",
                  borderRadius: "6px",
                  background: "var(--input-bg)",
                  border: "1px solid var(--input-border)",
                  color: "var(--text-main)",
                  width: "100%",
                  resize: "vertical",
                  fontFamily: "inherit"
                }}
              />
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  className="btn-secondary"
                  style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  onClick={() => {
                    setLocalNote(note || "");
                    setIsEditingNote(false);
                  }}
                  disabled={isSavingNote}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  onClick={handleSaveNote}
                  disabled={isSavingNote}
                >
                  {isSavingNote ? "Saving..." : "Save Note"}
                </button>
              </div>
            </div>
          ) : (
            <p style={{
              margin: 0,
              fontSize: "0.85rem",
              color: localNote ? "var(--text-secondary)" : "var(--text-dim)",
              fontStyle: localNote ? "normal" : "italic",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap"
            }}>
              {localNote || "No notes added for this day."}
            </p>
          )}
        </div>

        {/* Timeline */}
        {timeline.length === 0 ? (
          <p className="day-modal-empty">No sessions recorded for this day.</p>
        ) : (
          <div className="day-timeline">
            {timeline.map((item, idx) => {
              const deleteKey =
                item.type === "break"
                  ? `break-${item.previousLogId}-${item.nextLogId}`
                  : item.logId!;
              const isThisDeleting = deletingId === deleteKey;
              const isPendingThis =
                pendingDelete?.item.key === item.key && !isThisDeleting;
              const isEditingThis = editingId === item.logId;
              const isLast = idx === timeline.length - 1;

              return (
                <div
                  key={item.key}
                  className={[
                    "timeline-item",
                    `timeline-item-${item.type}`,
                    item.isActive ? "timeline-active" : "",
                    isPendingThis ? "timeline-item-pending" : "",
                    isThisDeleting ? "timeline-item-deleting" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="timeline-dot-col">
                    <div className="timeline-dot" />
                    {!isLast && <div className="timeline-connector" />}
                  </div>

                  <div className="timeline-body" style={{ width: "100%" }}>
                    
                    {isEditingThis ? (
                      <div className="modal-time-row" style={{ marginTop: "4px", marginBottom: "8px" }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <input
                            type="time"
                            value={editPunchIn}
                            onChange={(e) => setEditPunchIn(e.target.value)}
                            style={{ padding: "6px" }}
                          />
                        </div>
                        <div className="modal-time-arrow" style={{ paddingBottom: "10px" }}>→</div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <input
                            type="time"
                            value={editPunchOut}
                            onChange={(e) => setEditPunchOut(e.target.value)}
                            disabled={item.isActive}
                            style={{ padding: "6px" }}
                          />
                        </div>
                      </div>
                    ) : (
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
                    )}

                    <div className="timeline-meta-row" style={{ justifyContent: "space-between" }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                        
                        {!isEditingThis && (
                          <span className="tl-duration mono">
                            {fmtDur(item.durationMs)}
                            {item.isActive && (
                              <span
                                className="tl-active-dot"
                                title="Active session"
                              />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Editing Actions inline */}
                      {isEditingThis && (
                         <div style={{ display: 'flex', gap: '6px' }}>
                           <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={cancelEdit}>
                             Cancel
                           </button>
                           <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => executeEdit(item)} disabled={!!deletingId}>
                             {deletingId ? "..." : "Save"}
                           </button>
                         </div>
                      )}

                    </div>
                    {item.type === "work" && !isEditingThis && (
                      <div className="tl-position-label">
                        {item.position === "only" && "only session"}
                        {item.position === "first" && "first session"}
                        {item.position === "middle" && "middle session"}
                        {item.position === "last" &&
                          (item.isActive ? "active" : "last session")}
                      </div>
                    )}
                  </div>

                  {!item.isActive && !editingId && (
                     <div style={{ display: 'flex', gap: '4px', flexDirection: 'column' }}>
                        {item.type === "work" && (
                          <button
                            className="tl-delete-btn"
                            title="Edit this work session"
                            disabled={!!deletingId}
                            onClick={() => handleEditClick(item)}
                          >
                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Edit</span>
                          </button>
                        )}
                        <button
                          className={[
                            "tl-delete-btn",
                            isPendingThis ? "tl-delete-btn-pending" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          title={
                            item.type === "break"
                              ? "Remove break (merge surrounding sessions)"
                              : "Delete this work session"
                          }
                          disabled={!!deletingId}
                          onClick={() => {
                            if (isPendingThis) setPendingDelete(null);
                            else handleDeleteClick(item);
                          }}
                        >
                          {isThisDeleting ? (
                            <span
                              className="spinner"
                              style={{ width: 12, height: 12, borderWidth: 2 }}
                            />
                          ) : isPendingThis ? (
                            <RiCloseLine size={16} />
                          ) : (
                            <RiDeleteBinLine size={16} />
                          )}
                        </button>
                     </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer actions */}
        {timeline.length > 0 && !pendingDelete && !isConfirmingClear && !deletingId && (
          <div className="day-modal-footer-actions" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "16px",
            borderTop: "1px solid var(--card-border)",
            paddingTop: "12px"
          }}>
            <p className="dm-footer-hint" style={{ margin: 0 }}>
              <RiDeleteBinLine size={14} /> Click edit or delete to manage your sessions
            </p>
            <button
              onClick={() => setIsConfirmingClear(true)}
              className="btn-danger"
              disabled={!hasDeletableSessions}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "0.8rem",
                opacity: hasDeletableSessions ? 1 : 0.5,
                cursor: hasDeletableSessions ? "pointer" : "not-allowed"
              }}
            >
              <RiDeleteBinLine size={14} /> Clear Day Data
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Delete / Merge confirmation modal */}
      {pendingDelete && (
        <ConfirmationModal
          title={pendingDelete.item.type === "break" ? "Remove Break" : "Delete Session"}
          message={getConfirmMessage(pendingDelete.item)}
          confirmText={pendingDelete.item.type === "break" ? "Merge Sessions" : "Delete"}
          confirmBtnClass="btn-danger"
          onClose={handleCancel}
          onConfirm={handleConfirm}
          isLoading={!!deletingId}
        />
      )}

      {/* Clear Day confirmation modal */}
      {isConfirmingClear && (
        <ConfirmationModal
          title="Clear Day Data"
          message={
            date === new Date().toLocaleDateString("en-CA")
              ? "Are you sure you want to clear all completed sessions for today? Your active timer will not be affected."
              : `Are you sure you want to clear all sessions for ${displayDate}?`
          }
          confirmText="Clear Day"
          confirmBtnClass="btn-danger"
          onClose={() => setIsConfirmingClear(false)}
          onConfirm={executeClearDay}
          isLoading={deletingId === "clear-day-action"}
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

function ConfirmationModal({
  title,
  message,
  confirmText,
  confirmBtnClass = "btn-danger",
  onClose,
  onConfirm,
  isLoading = false,
}: ConfirmationModalProps) {
  return (
    <div className="modal-overlay" style={{ zIndex: 300, background: "rgba(0, 0, 0, 0.4)", backdropFilter: "none", WebkitBackdropFilter: "none" }} onClick={onClose}>
      <div
        className="modal-card animate-in"
        style={{ maxWidth: "400px", padding: "24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header modal-header-centered" style={{ marginBottom: "16px" }}>
          <h2>{title}</h2>
        </div>
        <div className="modal-body" style={{ textAlign: "center", padding: "10px 0" }}>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {message}
          </p>
        </div>
        <div className="modal-footer" style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
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
            {isLoading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
