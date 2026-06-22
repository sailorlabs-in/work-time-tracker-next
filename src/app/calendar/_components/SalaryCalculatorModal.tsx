"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  RiCloseLine,
  RiCalculatorLine,
  RiClipboardLine,
  RiCheckLine,
  RiWallet3Line,
  RiCalendarEventLine,
  RiInformationLine,
} from "@remixicon/react";

// ─── Local Storage Keys & Obfuscation ─────────────────────────
const SALARY_STORAGE_KEY = "wtt_salary_base_encrypted";
const ENCRYPTION_SALT = "wtt_sal_salt_2026";

function encryptSalary(salaryStr: string): string {
  if (!salaryStr) return "";
  let obfuscated = "";
  for (let i = 0; i < salaryStr.length; i++) {
    obfuscated += String.fromCharCode(
      salaryStr.charCodeAt(i) ^ ENCRYPTION_SALT.charCodeAt(i % ENCRYPTION_SALT.length)
    );
  }
  return btoa(obfuscated);
}

function decryptSalary(encrypted: string): string {
  if (!encrypted) return "";
  try {
    const raw = atob(encrypted);
    let decrypted = "";
    for (let i = 0; i < raw.length; i++) {
      decrypted += String.fromCharCode(
        raw.charCodeAt(i) ^ ENCRYPTION_SALT.charCodeAt(i % ENCRYPTION_SALT.length)
      );
    }
    return decrypted;
  } catch {
    return "";
  }
}

// ─── Interfaces ──────────────────────────────────────────────
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
  extendedProps: {
    log: WorkLog;
    type: "work" | "break";
    isActive?: boolean;
  };
}

interface Props {
  currentMonth: string; // YYYY-MM
  events: CalendarEvent[];
  holidays: Holiday[];
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────
function getMonthWeekendOffs(year: number, month: number) {
  let sundays = 0;
  let offSaturdays = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const day = date.getDay();
    if (day === 0) {
      sundays++;
    } else if (day === 6) {
      const weekNumber = Math.ceil(d / 7);
      if ([1, 3, 5].includes(weekNumber)) {
        offSaturdays++;
      }
    }
  }
  return { sundays, offSaturdays, daysInMonth };
}

export default function SalaryCalculatorModal({
  currentMonth,
  events,
  holidays,
  onClose,
}: Props) {
  // ── State Variables ────────────────────────────────────────
  const [baseSalaryInput, setBaseSalaryInput] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [extraOffs, setExtraOffs] = useState<number>(0);
  const [reducedHours, setReducedHours] = useState<number>(0);
  const [expectedOvertime, setExpectedOvertime] = useState<number>(0);
  const [takenLeave, setTakenLeave] = useState<number>(0);
  const [leaveUnit, setLeaveUnit] = useState<"days" | "hours">("days");

  const [copied, setCopied] = useState<boolean>(false);
  const [showSavedNotification, setShowSavedNotification] = useState<boolean>(false);

  // ── Load Encrypted Base Salary ─────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(SALARY_STORAGE_KEY);
    if (saved) {
      const decrypted = decryptSalary(saved);
      if (decrypted) {
        setBaseSalaryInput(decrypted);
      }
    }
  }, []);

  // Save base salary encrypted on change/blur
  const handleBaseSalaryChange = (val: string) => {
    const numericOnly = val.replace(/[^0-9]/g, "");
    setBaseSalaryInput(numericOnly);
    if (numericOnly) {
      localStorage.setItem(SALARY_STORAGE_KEY, encryptSalary(numericOnly));
      setShowSavedNotification(true);
      setTimeout(() => setShowSavedNotification(false), 2000);
    }
  };

  // ── Calculate Default Values from Calendar ────────────────
  const calendarDefaults = useMemo(() => {
    if (!selectedMonth) return { extraOffs: 0, reducedHours: 0, overtime: 0, absentDays: 0, insufficientHours: 0, insufficientDays: 0, totalPresentWorkingHours: 0 };

    const [year, month] = selectedMonth.split("-").map(Number);
    const { daysInMonth } = getMonthWeekendOffs(year, month);

    const monthHolidays = holidays.filter((h) => h.date.startsWith(selectedMonth));

    // 1. Classify Holidays & Extra Offs / Hours
    let defaultExtraOffs = 0;
    let defaultReducedHours = 0;

    monthHolidays.forEach((h) => {
      const isHalfDay = h.durationMinutes === 240 || (h.name && h.name.toLowerCase().includes("half day"));
      if (h.durationMinutes === null) {
        defaultExtraOffs += 1.0;
      } else if (isHalfDay) {
        defaultExtraOffs += 0.5;
      } else {
        defaultReducedHours += (h.durationMinutes || 0) / 60;
      }
    });

    // 2. Overtime & Leaves Daily Calculation
    let defaultOvertimeHours = 0;
    let defaultAbsentDays = 0;
    let defaultInsufficientHours = 0;
    let defaultInsufficientDays = 0;
    let totalPresentWorkingHours = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dateObj = new Date(year, month - 1, d);
      const dayOfWeek = dateObj.getDay();
      const weekNumber = Math.ceil(d / 7);

      const isOffDay = dayOfWeek === 0 || (dayOfWeek === 6 && [1, 3, 5].includes(weekNumber));
      const holidayForDay = monthHolidays.find((h) => h.date.startsWith(dateStr));
      
      const isFullHoliday = holidayForDay && holidayForDay.durationMinutes === null;
      const isHalfHoliday = holidayForDay && (holidayForDay.durationMinutes === 240 || (holidayForDay.name && holidayForDay.name.toLowerCase().includes("half day")));

      // Find work log events for this day
      const dayEvents = events.filter((e) => e.start.startsWith(dateStr));
      const dayWorkEvents = dayEvents.filter((e) => e.extendedProps.type === "work");
      const hasActiveWork = dayWorkEvents.some((e) => e.extendedProps.isActive);

      const totalWorkMs = dayWorkEvents.reduce((sum, e) => {
        const start = new Date(e.start).getTime();
        const end = e.end ? new Date(e.end).getTime() : Date.now();
        return sum + Math.max(0, end - start);
      }, 0);

      const totalWorkHours = totalWorkMs / 3600000;
      totalPresentWorkingHours += totalWorkHours;

      // Expected working hours on this day
      let expectedHours = 8;
      if (isOffDay || isFullHoliday) {
        expectedHours = 0;
      } else if (isHalfHoliday) {
        expectedHours = 4;
      } else if (holidayForDay && holidayForDay.durationMinutes !== null) {
        expectedHours = Math.max(0, 8 - (holidayForDay.durationMinutes / 60));
      }

      // ── Overtime calculation ──
      if (totalWorkMs > 60000) { // worked more than a minute
        let dayOvertimeMs = 0;
        if (isOffDay || isFullHoliday) {
          dayOvertimeMs = totalWorkMs;
        } else {
          const requiredWorkMs = expectedHours * 3600000;
          if (totalWorkMs > requiredWorkMs) {
            dayOvertimeMs = totalWorkMs - requiredWorkMs;
          }
        }

        const dayOtMin = dayOvertimeMs / 60000;
        let roundedOtMin = 0;
        if (dayOtMin >= 30) {
          roundedOtMin = Math.floor((dayOtMin - 15) / 30) * 30 + 30;
        }
        defaultOvertimeHours += roundedOtMin / 60;
      }

      // ── Absent & Insufficient hours calculation ──
      if (expectedHours > 0) {
        if (totalWorkMs === 0) {
          // Absent on working day
          defaultAbsentDays += isHalfHoliday ? 0.5 : 1.0;
        } else if (totalWorkHours < expectedHours && !hasActiveWork) {
          // Worked less than expected (excluding active timer)
          const earlyMin = (expectedHours - totalWorkHours) * 60;
          let roundedEarlyMin = 0;
          if (earlyMin > 30) {
            roundedEarlyMin = Math.floor((earlyMin - 15) / 30) * 30 + 30;
          }
          const roundedEarlyHours = roundedEarlyMin / 60;
          defaultInsufficientHours += roundedEarlyHours;
          if (roundedEarlyHours > 0) {
            defaultInsufficientDays += 1;
          }
        }
      }
    }

    return {
      extraOffs: defaultExtraOffs,
      reducedHours: defaultReducedHours,
      overtime: parseFloat(defaultOvertimeHours.toFixed(2)),
      absentDays: defaultAbsentDays,
      insufficientHours: parseFloat(defaultInsufficientHours.toFixed(2)),
      insufficientDays: defaultInsufficientDays,
      totalPresentWorkingHours: parseFloat(totalPresentWorkingHours.toFixed(2)),
    };
  }, [selectedMonth, events, holidays]);

  // Sync state with calculated defaults when calendar defaults change
  useEffect(() => {
    setExtraOffs(calendarDefaults.extraOffs);
    setReducedHours(calendarDefaults.reducedHours);
    setExpectedOvertime(calendarDefaults.overtime);
    setLeaveUnit("days");
    setTakenLeave(calendarDefaults.absentDays);
  }, [calendarDefaults]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Handle Leave Unit toggle without resetting user edits if they match old units
  const handleLeaveUnitChange = (newUnit: "days" | "hours") => {
    setLeaveUnit(newUnit);
    // Convert current state value proportionately
    if (newUnit === "days" && leaveUnit === "hours") {
      setTakenLeave(parseFloat((takenLeave / 8).toFixed(2)));
    } else if (newUnit === "hours" && leaveUnit === "days") {
      setTakenLeave(parseFloat((takenLeave * 8).toFixed(2)));
    }
  };

  // ── Main Salary Calculations ──────────────────────────────
  const calculationResults = useMemo(() => {
    const baseSalary = parseFloat(baseSalaryInput) || 0;
    if (baseSalary <= 0 || !selectedMonth) {
      return { 
        hourlySalary: 0, 
        overtimeSalary: 0, 
        expectedTotal: 0, 
        workableDays: 0, 
        workableHours: 0,
        dailySalary: 0,
        extraLeavePay: 0,
        leaveDeduction: 0,
      };
    }

    const [year, month] = selectedMonth.split("-").map(Number);
    const { sundays, offSaturdays } = getMonthWeekendOffs(year, month);

    // Total Workable Days = Month days - Sundays - 1st/3rd/5th Saturdays - extraOffs
    const workableDays = Math.max(
      0.5,
      getMonthWeekendOffs(year, month).daysInMonth - sundays - offSaturdays - extraOffs
    );

    // Total workable hours = workableDays * 8 - reducedHours
    const workableHours = Math.max(1, workableDays * 8 - reducedHours);

    // Hourly Salary (N / C)
    const hourlySalary = baseSalary / workableHours;

    // Daily Salary (N / workableDays)
    const dailySalary = baseSalary / workableDays;

    // Overtime Pay (O = ROUND(N/C*L, 0))
    const overtimeSalary = Math.round(hourlySalary * expectedOvertime);

    // Total leave taken in hours
    const totalLeaveHours = leaveUnit === "days" ? takenLeave * 8 : takenLeave;

    // Unused leave allowance (in hours, out of 8 hours / 1 day allowance)
    const unusedLeaveHours = Math.max(0, 8 - totalLeaveHours);

    // Unpaid leave hours (exceeding 1-day/8-hour paid leave allowance)
    const unpaidLeaveHours = Math.max(0, totalLeaveHours - 8);

    // Deduction Hours (M = unpaidLeaveHours + insufficientHours)
    const deductionHours = unpaidLeaveHours + calendarDefaults.insufficientHours;

    // Deduction Pay (P = ROUND(N/C*M, 0))
    const leaveDeduction = Math.round(hourlySalary * deductionHours);

    // Extra Leave Pay (pro-rated payout for the unused portion of the 1-day allowance)
    const extraLeavePay = Math.round(dailySalary * (unusedLeaveHours / 8));

    // Final Salary = N + O - P
    const expectedTotal = baseSalary + extraLeavePay + overtimeSalary - leaveDeduction;

    return {
      hourlySalary: parseFloat(hourlySalary.toFixed(2)),
      overtimeSalary: Math.round(overtimeSalary),
      expectedTotal: Math.round(expectedTotal),
      workableDays,
      workableHours,
      dailySalary: Math.round(dailySalary),
      extraLeavePay: Math.round(extraLeavePay),
      leaveDeduction: Math.round(leaveDeduction),
    };
  }, [baseSalaryInput, selectedMonth, extraOffs, reducedHours, expectedOvertime, takenLeave, leaveUnit, calendarDefaults]);

  // Generate exact copy text requested by user
  const formattedOutputText = useMemo(() => {
    return `Hourly Salary: ₹${calculationResults.hourlySalary.toFixed(2)}
Total Overtime Salary: ₹${calculationResults.overtimeSalary}
Expected Total Salary: ₹${calculationResults.expectedTotal}`;
  }, [calculationResults]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formattedOutputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate Month list for past 6 months and next 6 months to make selection easy
  const monthOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = -6; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const label = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      list.push({ value: `${yyyy}-${mm}`, label });
    }
    return list;
  }, []);


  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card day-modal-card animate-in"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "600px", padding: "28px" }}
      >
        {/* Header */}
        <div className="day-modal-header" style={{ marginBottom: "16px" }}>
          <div className="day-modal-title-block">
            <h2 className="day-modal-date" style={{ fontSize: "1.4rem", gap: "8px", alignItems: "center" }}>
              <RiCalculatorLine size={24} className="gradient-text" />
              Salary Calculator
              <div className="tooltip-container">
                <RiInformationLine size={16} style={{ color: "var(--text-muted)", opacity: 0.8 }} />
                <span className="tooltip-text">
                  We are not saving this modal&apos;s data in our database; this modal&apos;s data is securely saved in your local storage.
                </span>
              </div>
            </h2>
            <p className="mini-stat-label" style={{ textAlign: "left", marginTop: "2px" }}>
              Compute expected monthly earnings based on attendance &amp; overtime rules
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <RiCloseLine size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="salary-calculator-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Base Salary Input */}
          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="baseSalary" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <RiWallet3Line size={14} /> Base Monthly Salary (₹)
              </label>
              {showSavedNotification && (
                <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>
                  ✓ Saved securely
                </span>
              )}
            </div>
            <input
              type="text"
              id="baseSalary"
              placeholder="e.g. 25000"
              value={baseSalaryInput}
              onChange={(e) => handleBaseSalaryChange(e.target.value)}
              className="mono"
              style={{ padding: "10px 14px", fontSize: "1.05rem" }}
            />
          </div>

          {/* Month / Year Selector */}
          <div className="form-group">
            <label htmlFor="monthYear" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <RiCalendarEventLine size={14} /> Month &amp; Year
            </label>
            <select
              id="monthYear"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--text-main)",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                fontSize: "1rem",
                outline: "none",
                width: "100%",
                cursor: "pointer",
              }}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ background: "var(--card-bg)" }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="dual-input">
            {/* Extra Offs */}
            <div className="input-half">
              <label htmlFor="extraOffs" className="input-label-small" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Holidays / Extra Offs (Days)
              </label>
              <input
                type="number"
                id="extraOffs"
                min="0"
                max="31"
                step="0.5"
                value={extraOffs}
                onChange={(e) => setExtraOffs(Math.max(0, parseFloat(e.target.value) || 0))}
                className="mono"
                style={{ padding: "8px 12px", fontSize: "0.95rem" }}
              />
            </div>

            {/* Reduced Work Hours */}
            <div className="input-half">
              <label htmlFor="reducedHours" className="input-label-small" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Reduced Hours Events (Hrs)
              </label>
              <input
                type="number"
                id="reducedHours"
                min="0"
                value={reducedHours}
                onChange={(e) => setReducedHours(Math.max(0, parseFloat(e.target.value) || 0))}
                className="mono"
                style={{ padding: "8px 12px", fontSize: "0.95rem" }}
              />
            </div>
          </div>

          <div className="dual-input">
            {/* Expected Overtime */}
            <div className="input-half">
              <label htmlFor="expectedOvertime" className="input-label-small" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Expected Overtime (Hrs)
              </label>
              <input
                type="number"
                id="expectedOvertime"
                min="0"
                step="0.5"
                value={expectedOvertime}
                onChange={(e) => setExpectedOvertime(Math.max(0, parseFloat(e.target.value) || 0))}
                className="mono"
                style={{ padding: "8px 12px", fontSize: "0.95rem" }}
              />
            </div>

            {/* Taken Leave */}
            <div className="input-half">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="takenLeave" className="input-label-small">
                  Taken Leave
                </label>
                <div style={{ display: "flex", gap: "6px", marginBottom: "2px" }}>
                  <button
                    type="button"
                    onClick={() => handleLeaveUnitChange("days")}
                    style={{
                      background: leaveUnit === "days" ? "var(--accent-primary)" : "var(--slate-bg)",
                      color: leaveUnit === "days" ? "white" : "var(--text-muted)",
                      border: "none",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLeaveUnitChange("hours")}
                    style={{
                      background: leaveUnit === "hours" ? "var(--accent-primary)" : "var(--slate-bg)",
                      color: leaveUnit === "hours" ? "white" : "var(--text-muted)",
                      border: "none",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Hrs
                  </button>
                </div>
              </div>
              <input
                type="number"
                id="takenLeave"
                min="0"
                step="0.5"
                value={takenLeave}
                onChange={(e) => setTakenLeave(Math.max(0, parseFloat(e.target.value) || 0))}
                className="mono"
                style={{ padding: "8px 12px", fontSize: "0.95rem" }}
              />
            </div>
          </div>

          {/* Quick Informational Notice */}
          <div
            style={{
              background: "var(--accent-subtle)",
              border: "1px solid var(--accent-glow)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
            }}
          >
            <RiInformationLine size={18} style={{ color: "var(--accent-primary)", flexShrink: 0, marginTop: "2px" }} />
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4, margin: 0 }}>
              Calculations assume a standard 8-hour workday. A monthly paid leave allowance of 1 day is factored. Taking 0 leaves awards a 1-day bonus payout. Sundays and 1st, 3rd, and 5th Saturdays are company off-days.
            </p>
          </div>

          {/* output results container */}
          <div
            className="glass-card"
            style={{
              background: "rgba(10, 10, 12, 0.4)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-lg)",
              padding: "16px 20px",
              marginTop: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="mini-stat-label" style={{ fontWeight: 700, color: "var(--accent-primary)" }}>
                CALCULATION OUTPUT
              </span>
              <button
                type="button"
                onClick={copyToClipboard}
                style={{
                  background: "transparent",
                  border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-muted)",
                  padding: "4px 8px",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  transition: "all var(--transition)",
                }}
                className="btn-copy-ot"
              >
                {copied ? <RiCheckLine size={14} style={{ color: "var(--success)" }} /> : <RiClipboardLine size={14} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            {/* Fenced Output Display Block */}
            <pre
              className="mono"
              style={{
                margin: 0,
                padding: "12px 14px",
                background: "rgba(0,0,0,0.3)",
                border: "1px dashed var(--accent-glow)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-main)",
                fontSize: "1rem",
                fontWeight: "700",
                lineHeight: "1.6",
                whiteSpace: "pre-line",
                textAlign: "left",
              }}
            >
              {formattedOutputText}
            </pre>
          </div>

        </div>
      </div>
    </div>
  );
}
