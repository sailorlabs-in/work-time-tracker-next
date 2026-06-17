"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import DayDetailModal from "./DayDetailModal";
import ManualEntryPanel from "./ManualEntryPanel";
import SalaryCalculatorModal from "./SalaryCalculatorModal";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { RiWifiOffLine } from "@remixicon/react";

const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => (
    <div className="calendar-skeleton">
      <div className="calendar-skeleton-header" />
      <div className="calendar-skeleton-grid">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="calendar-skeleton-cell" />
        ))}
      </div>
    </div>
  ),
});

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

const CALENDAR_CACHE_KEY = "wtt_calendar_cache";

interface DayNote {
  id: string;
  userId: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

interface CalendarCache {
  events: CalendarEvent[];
  holidays: Holiday[];
  notes?: DayNote[];
  cachedAt: number;
}

interface Holiday {
  id: string;
  name: string;
  date: string;
  durationMinutes: number | null;
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
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    log: WorkLog;
    type: "work" | "break";
    isActive?: boolean;
    previousLogId?: string;
    nextLogId?: string;
  };
}

interface CalendarClientProps {
  initialEvents: CalendarEvent[];
  initialHolidays?: Holiday[];
  initialNotes?: DayNote[];
  adminUserId?: string;
  timeFormat?: string;
  workDurationMs?: number;
}

// ─── Helpers ─────────────────────────────────────────────────
function msFmt(ms: number): string {
  if (ms <= 0) return "";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}hr`;
  return `${h}hr ${m}min`;
}

function saveCalendarCache(
  events: CalendarEvent[],
  holidays: Holiday[],
  notes?: DayNote[],
): void {
  try {
    const cache: CalendarCache = {
      events,
      holidays,
      notes,
      cachedAt: Date.now(),
    };
    localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full — fail silently
  }
}

function loadCalendarCache(): CalendarCache | null {
  try {
    const raw = localStorage.getItem(CALENDAR_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CalendarCache;
  } catch {
    return null;
  }
}

// ─── Main Component ───────────────────────────────────────────
export default function CalendarClient({
  initialEvents,
  initialHolidays = [],
  initialNotes = [],
  adminUserId,
  timeFormat,
  workDurationMs = 8 * 3600000,
}: CalendarClientProps) {
  const { isOnline, isServerReachable } = useOnlineStatus();
  const isOffline = !isOnline || !isServerReachable;

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [holidays, setHolidays] = useState<Holiday[]>(initialHolidays);
  const [notes, setNotes] = useState<DayNote[]>(initialNotes);
  const [dataLoading, setDataLoading] = useState(false);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const fetchedRef = useRef(false);

  // On mount: if server returned empty data (offline SSR) try loading from cache
  useEffect(() => {
    if (initialEvents.length === 0) {
      const cache = loadCalendarCache();
      if (cache) {
        setEvents(cache.events);
        setHolidays(cache.holidays);
        if (cache.notes) {
          setNotes(cache.notes);
        }
        const extracted = cache.events
          .filter((e) => e.extendedProps.type === "work")
          .map((e) => e.extendedProps.log);
        setLogs(Array.from(new Map(extracted.map((l) => [l.id, l])).values()));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialEvents.length > 0 && logs.length === 0) {
      const extracted = initialEvents
        .filter((e) => e.extendedProps.type === "work")
        .map((e) => e.extendedProps.log);
      setLogs(Array.from(new Map(extracted.map((l) => [l.id, l])).values()));
    }
  }, [initialEvents, logs.length]);

  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Update active event end every minute
  useEffect(() => {
    if (!currentTime) return;
    setEvents((prev) => {
      if (!prev.some((e) => e.extendedProps.isActive)) return prev;
      return prev.map((event) => {
        if (!event.extendedProps.isActive) return event;
        const start = new Date(event.start as string).getTime();
        const durationMs = currentTime.getTime() - start;
        return {
          ...event,
          end: currentTime.toISOString(),
          title: `Work: ${(durationMs / 3600000).toFixed(1)}h 🟢`,
        };
      });
    });
  }, [currentTime]);

  const fetchLogs = useCallback(
    async (startDate?: string, endDate?: string) => {
      // Skip network fetch entirely when offline
      if (isOffline) return;

      try {
        setDataLoading(true);
        let url = adminUserId
          ? `/api/admin/users/${adminUserId}/logs`
          : `/api/worklog`;

        const queryParams = [];
        if (startDate)
          queryParams.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate) queryParams.push(`endDate=${encodeURIComponent(endDate)}`);

        if (queryParams.length > 0) {
          url += `?${queryParams.join("&")}`;
        }

        const holidayUrl = `/api/holidays${queryParams.length > 0 ? `?${queryParams.join("&")}` : ""}`;
        const notesUrl = `/api/notes${queryParams.length > 0 ? `?${queryParams.join("&")}` : ""}`;

        const [res, holRes, notesRes] = await Promise.all([
          fetch(url),
          fetch(holidayUrl),
          fetch(notesUrl),
        ]);

        let fetchedEvents: CalendarEvent[] = events;
        let fetchedHolidays: Holiday[] = holidays;
        let fetchedNotes: DayNote[] = notes;

        if (res.ok) {
          fetchedEvents = await res.json();
          setEvents(fetchedEvents);
          const extracted = fetchedEvents
            .filter((e) => e.extendedProps.type === "work")
            .map((e) => e.extendedProps.log);
          setLogs(
            Array.from(new Map(extracted.map((l) => [l.id, l])).values()),
          );
        }

        if (holRes.ok) {
          fetchedHolidays = await holRes.json();
          setHolidays(fetchedHolidays);
        }

        if (notesRes.ok) {
          fetchedNotes = await notesRes.json();
          setNotes(fetchedNotes);
        }

        // Persist to cache for offline use
        saveCalendarCache(fetchedEvents, fetchedHolidays, fetchedNotes);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      } finally {
        setDataLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminUserId, isOffline, events, holidays, notes],
  );

  const [currentMonth, setCurrentMonth] = useState<string>("");

  const handleDatesSet = (dateInfo: { startStr: string; endStr: string }) => {
    const startObj = new Date(dateInfo.startStr);
    const endObj = new Date(dateInfo.endStr);
    const midPoint = new Date(
      startObj.getTime() + (endObj.getTime() - startObj.getTime()) / 2,
    );

    const yyyy = midPoint.getFullYear();
    const mm = String(midPoint.getMonth() + 1).padStart(2, "0");
    setCurrentMonth(`${yyyy}-${mm}`);

    // Don't fetch when offline
    if (isOffline) return;

    if (!fetchedRef.current) {
      fetchedRef.current = true;
      if (adminUserId) {
        fetchLogs(dateInfo.startStr, dateInfo.endStr);
      }
      return;
    }
    fetchLogs(dateInfo.startStr, dateInfo.endStr);
  };

  // Day/event click — disabled when offline
  const handleDateClick = (arg: { dateStr: string }) => {
    if (isOffline) return;
    setDayModalDate(arg.dateStr);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventClick = (info: any) => {
    if (isOffline) return;
    const dateStr = (info.event.startStr as string).split("T")[0];
    setDayModalDate(dateStr);
  };

  const dailySummaryMap = useMemo(() => {
    const map: Record<
      string,
      { workMs: number; breakMs: number; hasActive: boolean }
    > = {};
    events.forEach((e) => {
      const dateStr = e.start.split("T")[0];
      if (!map[dateStr])
        map[dateStr] = { workMs: 0, breakMs: 0, hasActive: false };
      const dur = Math.max(
        0,
        (e.end ? new Date(e.end).getTime() : Date.now()) -
          new Date(e.start).getTime(),
      );
      if (e.extendedProps.type === "work") {
        map[dateStr].workMs += dur;
        if (e.extendedProps.isActive) map[dateStr].hasActive = true;
      } else {
        map[dateStr].breakMs += dur;
      }
    });
    return map;
  }, [events]);

  const holidaysMap = useMemo(() => {
    const map: Record<string, Holiday> = {};
    holidays.forEach((h) => {
      const dateObj = new Date(h.date);
      const y = dateObj.getFullYear();
      const mo = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      const localDateStr = `${y}-${mo}-${d}`;
      map[localDateStr] = h;
    });
    return map;
  }, [holidays]);

  const notesMap = useMemo(() => {
    const map: Record<string, string> = {};
    notes.forEach((n) => {
      const dateStr = n.date.split("T")[0];
      map[dateStr] = n.note;
    });
    return map;
  }, [notes]);

  // ── Month stats ──────────────────────────────────────────────
  const [stats, setStats] = useState({
    totalMonthHours: 0,
    totalDaysWorked: 0,
    avgHoursPerDay: 0,
  });
  useEffect(() => {
    if (!currentMonth) return;
    const daily: Record<string, number> = {};

    events.forEach((e) => {
      if (e.extendedProps.type === "work" && e.start.startsWith(currentMonth)) {
        const day = e.start.split("T")[0];
        const startMs = new Date(e.start).getTime();
        const endMs = e.end
          ? new Date(e.end).getTime()
          : currentTime
            ? currentTime.getTime()
            : Date.now();
        const durHours = Math.max(0, endMs - startMs) / 3600000;
        daily[day] = (daily[day] || 0) + durHours;
      }
    });

    const totalHours = Object.values(daily).reduce((s, h) => s + h, 0);
    const totalDays = Object.keys(daily).length;
    setStats({
      totalMonthHours: totalHours,
      totalDaysWorked: totalDays,
      avgHoursPerDay: totalDays > 0 ? totalHours / totalDays : 0,
    });
  }, [events, currentMonth, currentTime]);

  return (
    <main className="main-content calendar-page">
      {/* Page Header */}
      <div className="calendar-header">
        <div>
          <h1 className="gradient-text">Work Calendar</h1>
        </div>
        <div className="calendar-header-right">
          <div className="calendar-stats">
            <div className="mini-stat">
              <span className="mini-stat-value mono">
                {stats.totalMonthHours.toFixed(1)}h
              </span>
              <span className="mini-stat-label">Total Hours</span>
            </div>
            <div className="mini-stat">
              <span className="mini-stat-value mono">
                {stats.totalDaysWorked}
              </span>
              <span className="mini-stat-label">Days Worked</span>
            </div>
            <div className="mini-stat">
              <span className="mini-stat-value mono">
                {stats.avgHoursPerDay.toFixed(1)}h
              </span>
              <span className="mini-stat-label">Avg / Day</span>
            </div>
          </div>
          {/* Hide Manual Entry when offline or for admin views */}
          {!adminUserId && (
            <button
              className="btn-add-record"
              onClick={() => setShowSalaryModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🧮 Salary Calculator
            </button>
          )}
          {!adminUserId && !isOffline && (
            <button
              className="btn-add-record"
              onClick={() => setShowManualModal(true)}
            >
              Add Past Day Record
            </button>
          )}
        </div>
      </div>

      {/* Offline notice */}
      {isOffline && (
        <div className="calendar-offline-notice">
          <span className="calendar-offline-notice__icon">
            <RiWifiOffLine size={15} />
          </span>
          No connection — showing last cached data. Navigation &amp; editing
          disabled.
        </div>
      )}

      {/* Full-width Calendar */}
      <div
        className={`glass-card calendar-wrapper animate-in${isOffline ? " calendar-offline-mode" : ""}`}
        style={{ position: "relative" }}
      >
        {dataLoading && (
          <div className="calendar-data-loading">
            <div className="spinner" />
          </div>
        )}
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: "prev,next", center: "title", right: "today" }}
          dayHeaderFormat={{ weekday: "long" }}
          dayCellClassNames={(arg) => {
            const dateStr =
              arg.date.getFullYear() +
              "-" +
              String(arg.date.getMonth() + 1).padStart(2, "0") +
              "-" +
              String(arg.date.getDate()).padStart(2, "0");
            const hol = holidaysMap[dateStr];
            if (hol && hol.durationMinutes === null)
              return ["fc-unavailable-day"];

            const day = arg.date.getDay();
            if (day === 0) return ["fc-unavailable-day"];
            if (day === 6) {
              const weekNumber = Math.ceil(arg.date.getDate() / 7);
              if ([1, 3, 5].includes(weekNumber)) return ["fc-unavailable-day"];
            }
            return [];
          }}
          eventDisplay="none"
          dayCellContent={(arg) => {
            const y = arg.date.getFullYear();
            const mo = String(arg.date.getMonth() + 1).padStart(2, "0");
            const d = String(arg.date.getDate()).padStart(2, "0");
            const dateStr = `${y}-${mo}-${d}`;
            const summary = dailySummaryMap[dateStr];
            const hol = holidaysMap[dateStr];

            let overtimeMs = 0;
            let earlyMs = 0;

            const day = arg.date.getDay();
            const weekNumber = Math.ceil(arg.date.getDate() / 7);
            const isOffDay =
              day === 0 || (day === 6 && [1, 3, 5].includes(weekNumber));
            const isFullDayHoliday = hol && hol.durationMinutes === null;

            if (summary && summary.workMs > 60000) {
              if (isOffDay || isFullDayHoliday) {
                overtimeMs = summary.workMs;
              } else {
                let effectiveWorkDurationMs = workDurationMs;
                let applyEgCooldown = true;

                if (hol && hol.durationMinutes !== null) {
                  effectiveWorkDurationMs = Math.max(
                    0,
                    workDurationMs - hol.durationMinutes * 60000,
                  );
                  applyEgCooldown = false;
                }

                if (summary.workMs > effectiveWorkDurationMs) {
                  overtimeMs = summary.workMs - effectiveWorkDurationMs;
                } else if (
                  !summary.hasActive &&
                  (applyEgCooldown
                    ? summary.workMs < effectiveWorkDurationMs - 30 * 60000
                    : summary.workMs < effectiveWorkDurationMs)
                ) {
                  earlyMs = effectiveWorkDurationMs - summary.workMs;
                }
              }
            }

            if (overtimeMs <= 30 * 60000) {
              overtimeMs = 0;
            }

            const note = notesMap[dateStr];

            return (
              <div className={`fc-day-cell-inner ${hol ? "has-holiday" : ""}`}>
                <span className="fc-daygrid-day-number">
                  {arg.dayNumberText}
                </span>
                {overtimeMs > 0 && (
                  <span className="dcs-overtime">
                    O.T. ({msFmt(overtimeMs)})
                  </span>
                )}
                {earlyMs > 0 && (
                  <span className="dcs-early">E.G. ({msFmt(earlyMs)})</span>
                )}
                {summary && summary.workMs > 60000 && (
                  <div className="day-cell-summary">
                    {summary.hasActive && (
                      <span className="dcs-active">🟢 Active</span>
                    )}
                    <span className="dcs-work">⏱ {msFmt(summary.workMs)}</span>
                    {summary.breakMs > 60000 && (
                      <span className="dcs-break">
                        ☕ {msFmt(summary.breakMs)}
                      </span>
                    )}
                  </div>
                )}
                {note && (
                  <span className="dcs-note" title={note}>
                    📝 Note
                  </span>
                )}
                {hol && (
                  <div className="doc-holiday-wrapper">
                    <div
                      className={`doc-holiday ${hol.durationMinutes === null ? "doc-holiday-full" : "doc-holiday-partial"}`}
                    >
                      {hol.durationMinutes !== null && (
                        <span>
                          ({Math.floor(hol.durationMinutes / 60)}h{" "}
                          {hol.durationMinutes % 60}m){" "}
                        </span>
                      )}
                      {hol.name}
                    </div>
                  </div>
                )}
              </div>
            );
          }}
          showNonCurrentDates={false}
          fixedWeekCount={false}
          events={events}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          datesSet={handleDatesSet}
          height="auto"
          nowIndicator={true}
        />
      </div>

      {/* Day Detail Modal — never shown when offline */}
      {dayModalDate && !isOffline && (
        <DayDetailModal
          date={dayModalDate}
          events={events}
          timeFormat={timeFormat || "12h"}
          onClose={() => setDayModalDate(null)}
          holiday={holidaysMap[dayModalDate]}
          workDurationMs={workDurationMs}
          note={notesMap[dayModalDate]}
          onRefresh={() => {
            fetchLogs();
            setDayModalDate(null);
          }}
        />
      )}

      {/* Manual Past-Day Entry Modal — never shown when offline */}
      {showManualModal && !isOffline && (
        <div
          className="modal-overlay"
          onClick={() => setShowManualModal(false)}
        >
          <div
            className="manual-entry-modal-card animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="manual-entry-modal-header">
              <span />
              <button
                className="modal-close"
                onClick={() => setShowManualModal(false)}
              >
                ✕
              </button>
            </div>
            <ManualEntryPanel
              onRefresh={() => {
                fetchLogs();
                setShowManualModal(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Salary Calculator Modal */}
      {showSalaryModal && (
        <SalaryCalculatorModal
          currentMonth={currentMonth}
          events={events}
          holidays={holidays}
          onClose={() => setShowSalaryModal(false)}
        />
      )}
    </main>
  );
}
