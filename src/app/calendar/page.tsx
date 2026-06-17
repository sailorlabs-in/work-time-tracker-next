import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getWorkLogs, getUserProfile, getHolidays, getDayNotes } from "@/lib/api-services";
import CalendarClient from "./_components/CalendarClient";

export default async function CalendarPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Graceful SSR degradation: if server/DB is unreachable, return empty arrays.
  // CalendarClient will load from wtt_calendar_cache (localStorage) when offline.
  let events: Awaited<ReturnType<typeof getWorkLogs>> = [];
  let userProfile = null;
  let holidays: Awaited<ReturnType<typeof getHolidays>> = [];
  let notes: Awaited<ReturnType<typeof getDayNotes>> = [];

  try {
    [events, userProfile, holidays, notes] = await Promise.all([
      getWorkLogs(session.user.id),
      getUserProfile(session.user.id),
      getHolidays(),
      getDayNotes(session.user.id),
    ]);
  } catch {
    // Server unreachable — CalendarClient will fall back to cached data
  }

  const workDurationMs = userProfile
    ? userProfile.workHours * 3600000 + userProfile.workMinutes * 60000
    : 8 * 3600000;

  return (
    <CalendarClient
      initialEvents={events}
      initialHolidays={holidays}
      initialNotes={notes}
      timeFormat={userProfile?.timeFormat || "12h"}
      workDurationMs={workDurationMs}
    />
  );
}
