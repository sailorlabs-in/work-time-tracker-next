import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserProfile } from "@/lib/api-services";
import AdminClient from "./_components/AdminClient";
import { getAppName } from "@/lib/brand";

export const metadata = {
  title: `Admin Panel | ${getAppName()}`,
};

export default async function AdminPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (!session.user.isAdmin) {
    redirect("/dashboard");
  }

  const userProfile = await getUserProfile(session.user.id);

  return (
    <main className="main-content admin-page">
      <AdminClient 
        currentUserId={session.user.id} 
        timeFormat={userProfile?.timeFormat || "12h"} 
      />
    </main>
  );
}
