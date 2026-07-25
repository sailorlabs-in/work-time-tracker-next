/**
 * Shared weekend policy utility functions.
 * Used by both client (calendar, salary calc) and server (API routes)
 * to determine off-days based on a policy configuration.
 */

export interface WeekendPolicyData {
  sundayOff: boolean;
  saturdayRule: string; // "all" | "none" | "alternate_135" | "alternate_24" | "custom"
  customSaturdays: number[]; // week numbers (1-5) that are off when rule is "custom"
}

// Default policy matching the old hardcoded behavior
export const DEFAULT_WEEKEND_POLICY: WeekendPolicyData = {
  sundayOff: true,
  saturdayRule: "alternate_135",
  customSaturdays: [],
};

/**
 * Returns the week-of-month number (1-5) for a given date.
 * e.g. the 1st Saturday of the month → weekNumber = 1
 */
export function getWeekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

/**
 * Returns true if the given Saturday's week number is an off-day
 * according to the saturday rule.
 */
function isSaturdayOff(weekNumber: number, policy: WeekendPolicyData): boolean {
  switch (policy.saturdayRule) {
    case "all":
      return true;
    case "none":
      return false;
    case "alternate_135":
      return [1, 3, 5].includes(weekNumber);
    case "alternate_24":
      return [2, 4].includes(weekNumber);
    case "custom":
      return policy.customSaturdays.includes(weekNumber);
    default:
      return [1, 3, 5].includes(weekNumber); // fallback to current behavior
  }
}

/**
 * Returns true if the given date is a weekend off-day per the policy.
 * Does NOT check for holidays — only weekends.
 */
export function isWeekendOffDay(date: Date, policy: WeekendPolicyData): boolean {
  const dayOfWeek = date.getDay();

  // Sunday check
  if (dayOfWeek === 0 && policy.sundayOff) {
    return true;
  }

  // Saturday check
  if (dayOfWeek === 6) {
    const weekNumber = getWeekOfMonth(date);
    return isSaturdayOff(weekNumber, policy);
  }

  return false;
}

/**
 * For a given month, count the number of Sundays and off-Saturdays
 * according to the policy. Used by the salary calculator.
 */
export function getMonthWeekendOffs(
  year: number,
  month: number, // 1-indexed (1 = January)
  policy: WeekendPolicyData,
): { sundays: number; offSaturdays: number; daysInMonth: number } {
  let sundays = 0;
  let offSaturdays = 0;
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const day = date.getDay();
    if (day === 0 && policy.sundayOff) {
      sundays++;
    } else if (day === 6) {
      const weekNumber = Math.ceil(d / 7);
      if (isSaturdayOff(weekNumber, policy)) {
        offSaturdays++;
      }
    }
  }

  return { sundays, offSaturdays, daysInMonth };
}

/**
 * Returns a human-readable label for the saturday rule.
 */
export function getSaturdayRuleLabel(rule: string): string {
  switch (rule) {
    case "all":
      return "Every Saturday";
    case "none":
      return "No Saturdays";
    case "alternate_135":
      return "1st, 3rd & 5th Saturdays";
    case "alternate_24":
      return "2nd & 4th Saturdays";
    case "custom":
      return "Custom Saturdays";
    default:
      return rule;
  }
}
