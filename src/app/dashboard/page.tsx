import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTimerState, getUserProfile } from "@/lib/api-services";
import DashboardClient from "./_components/DashboardClient";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Graceful SSR degradation: if DB/server is unreachable, return null
  // so the client-side localStorage fallback in useWorkTimer kicks in.
  let timerState = null;
  let userProfile = null;
  try {
    [timerState, userProfile] = await Promise.all([
      getTimerState(session.user.id),
      getUserProfile(session.user.id),
    ]);
  } catch {
    // Server unreachable — client will hydrate from localStorage
  }

  return (
    <DashboardClient
      initialTimerState={timerState}
      userProfile={userProfile}
    />
  );
}
