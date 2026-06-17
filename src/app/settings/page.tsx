import SettingsClient from "./_components/SettingsClient";
import { getAppName } from "@/lib/brand";

export const metadata = {
  title: `Settings - ${getAppName()}`,
  description: "Manage your profile, password, and notification preferences.",
};

export default function SettingsPage() {
  return (
    <div className="main-content dashboard-page">
      <SettingsClient />
    </div>
  );
}
