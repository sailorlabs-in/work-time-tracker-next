"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  RiUserSettingsLine,
  RiErrorWarningLine,
  RiCheckboxCircleLine,
  RiNotification3Line,
  RiLockPasswordLine,
  RiEyeOffLine,
  RiEyeLine,
  RiTimerLine,
  RiCalendarEventLine,
  RiGlobalLine,
  RiDeleteBinLine,
  RiEdit2Line,
} from "@remixicon/react";
import { getSaturdayRuleLabel } from "@/lib/weekendPolicy";

export default function SettingsClient() {
  const { data: session } = useSession();

  const [name, setName] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifyOnCompletion, setNotifyOnCompletion] = useState(true);
  const [notifyConstant, setNotifyConstant] = useState(false);
  const [notifyInterval, setNotifyInterval] = useState(30);
  const [timeFormat, setTimeFormat] = useState("12h");
  const [workHours, setWorkHours] = useState(8);
  const [workMinutes, setWorkMinutes] = useState(0);
  const [breakMinutes, setBreakMinutes] = useState(60);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [profileMessage, setProfileMessage] = useState({ type: "", text: "" });
  const [passwordMessage, setPasswordMessage] = useState({
    type: "",
    text: "",
  });

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Timezone
  const [timezone, setTimezone] = useState("");

  // Events & Weekend Policy
  const [useServerPolicy, setUseServerPolicy] = useState(true);
  const [customSundayOff, setCustomSundayOff] = useState(true);
  const [customSaturdayRule, setCustomSaturdayRule] = useState("alternate_135");
  const [customSaturdays, setCustomSaturdays] = useState<number[]>([]);
  const [isSavingWeekendPolicy, setIsSavingWeekendPolicy] = useState(false);

  // Custom Holidays
  type UserHolidayItem = { id: string; name: string; date: string; durationMinutes: number | null };
  const [userHolidays, setUserHolidays] = useState<UserHolidayItem[]>([]);
  const [newHolName, setNewHolName] = useState("");
  const [newHolDate, setNewHolDate] = useState("");
  const [newHolType, setNewHolType] = useState<"full" | "partial">("full");
  const [newHolDurationH, setNewHolDurationH] = useState(0);
  const [newHolDurationM, setNewHolDurationM] = useState(0);
  const [editingHolId, setEditingHolId] = useState<string | null>(null);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      if (!session?.user) return;
      try {
        const res = await fetch("/api/user/profile");
        if (res.ok) {
          const data = await res.json();
          setName(data.name || "");
          setNotificationsEnabled(data.notificationsEnabled ?? true);
          setNotifyOnCompletion(data.notifyOnCompletion ?? true);
          setNotifyConstant(data.notifyConstant ?? false);
          setNotifyInterval(data.notifyInterval ?? 30);
          setTimeFormat(data.timeFormat || "12h");
          setWorkHours(data.workHours ?? 8);
          setWorkMinutes(data.workMinutes ?? 0);
          setBreakMinutes(data.breakMinutes ?? 60);
          setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
          setUseServerPolicy(data.useServerPolicy ?? true);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setIsLoadingProfile(false);
      }
    }
    fetchProfile();

    // Auto-detect timezone from browser
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detectedTz) setTimezone(detectedTz);
  }, [session]);

  // Fetch custom weekend policy and holidays when useServerPolicy is toggled off
  useEffect(() => {
    if (!useServerPolicy && session?.user) {
      // Fetch user's custom weekend policy
      fetch("/api/user/weekend-policy")
        .then((r) => r.json())
        .then((data) => {
          if (data) {
            setCustomSundayOff(data.sundayOff ?? true);
            setCustomSaturdayRule(data.saturdayRule || "alternate_135");
            setCustomSaturdays(data.customSaturdays || []);
          }
        })
        .catch(() => {});

      // Fetch user's custom holidays
      setIsLoadingHolidays(true);
      fetch("/api/user/holidays")
        .then((r) => r.json())
        .then((data) => setUserHolidays(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setIsLoadingHolidays(false));
    }
  }, [useServerPolicy, session]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage({ type: "", text: "" });

    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          notificationsEnabled,
          notifyOnCompletion,
          notifyConstant,
          notifyInterval,
          timeFormat,
          workHours,
          workMinutes,
          breakMinutes,
          timezone,
          useServerPolicy,
        }),
      });

      if (res.ok) {
        window.dispatchEvent(
          new CustomEvent("show-toast", {
            detail: { message: "Profile updated successfully!" },
          })
        );
        // Ask for permissions if toggled on
        if (notificationsEnabled && "Notification" in window) {
          if (
            Notification.permission !== "granted" &&
            Notification.permission !== "denied"
          ) {
            Notification.requestPermission();
          }
        }
      } else {
        const data = await res.json();
        setProfileMessage({
          type: "error",
          text: data.error || "Failed to update profile.",
        });
      }
    } catch {
      setProfileMessage({ type: "error", text: "Network error occurred." });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPassword(true);
    setPasswordMessage({ type: "", text: "" });

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        type: "error",
        text: "New passwords do not match.",
      });
      setIsSavingPassword(false);
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({
        type: "error",
        text: "New password must be at least 6 characters.",
      });
      setIsSavingPassword(false);
      return;
    }

    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setPasswordMessage({
          type: "success",
          text: "Password changed successfully!",
        });
        window.dispatchEvent(
          new CustomEvent("show-toast", {
            detail: { message: "Password changed successfully!" },
          })
        );
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        setPasswordMessage({
          type: "error",
          text: data.error || "Failed to change password.",
        });
      }
    } catch {
      setPasswordMessage({ type: "error", text: "Network error occurred." });
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="page-loader">
        <div className="loader-spinner" />
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Account Settings</h1>
        <p>Manage your profile, password, and preferences</p>
      </div>

      <div className="settings-stack">
        
        {/* Profile Details Card */}
        <div className="glass-card settings-section animate-in">
          <div className="settings-section-header">
            <div className="title">
              <RiUserSettingsLine size={20} />
              <h2>Profile Details</h2>
            </div>
            <p>Your personal information and connected email address.</p>
          </div>

          <form onSubmit={handleProfileSubmit}>
            <div className="settings-section-body">
              {profileMessage.text && (
                <div className={`dm-message dm-message-${profileMessage.type}`} style={{ marginBottom: "16px" }}>
                  {profileMessage.type === "error" ? (
                    <RiErrorWarningLine className="dm-msg-icon" size={18} />
                  ) : (
                    <RiCheckboxCircleLine className="dm-msg-icon" size={18} />
                  )}
                  {profileMessage.text}
                </div>
              )}

              <div className="settings-row">
                <div className="settings-row-info">
                  <label htmlFor="email">Email</label>
                  <p>The email address associated with your account.</p>
                </div>
                <div className="settings-row-control">
                  <input
                    type="email"
                    id="email"
                    value={session?.user?.email || ""}
                    disabled
                    className="input-disabled"
                  />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-info">
                  <label htmlFor="name">Display Name</label>
                  <p>Your public-facing name across the application.</p>
                </div>
                <div className="settings-row-control">
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>
              </div>

            </div>
            <div className="settings-card-footer">
              <button
                type="submit"
                className="btn-primary"
                disabled={isSavingProfile}
              >
                {isSavingProfile ? <span className="spinner"></span> : "Save Profile"}
              </button>
            </div>
          </form>
        </div>

        {/* Timezone Card */}
        <div className="glass-card settings-section animate-in delay-1">
          <div className="settings-section-header">
            <div className="title">
              <RiGlobalLine size={20} />
              <h2>Timezone</h2>
            </div>
            <p>Your timezone is auto-detected from your browser and used for time tracking.</p>
          </div>
          <div className="settings-section-body">
            <div className="settings-row">
              <div className="settings-row-info">
                <label>Detected Timezone</label>
                <p>This timezone is automatically detected and saved with your profile.</p>
              </div>
              <div className="settings-row-control">
                <input
                  type="text"
                  value={timezone}
                  disabled
                  className="input-disabled"
                  style={{ maxWidth: "320px" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Notification Preferences Card */}
        <div className="glass-card settings-section animate-in delay-1">
          <div className="settings-section-header">
            <div className="title">
              <RiNotification3Line size={20} />
              <h2>Notification Preferences</h2>
            </div>
            <p>Choose when and how often you want to receive alerts.</p>
          </div>

          <form onSubmit={handleProfileSubmit}>
            <div className="settings-section-body">
              {/* Global Switch: Desktop Notifications */}
              <div className="settings-row">
                <div className="settings-row-info">
                  <label>Desktop Notifications</label>
                  <p>Enable push alerts and desktop popup notifications for work tracker activities.</p>
                </div>
                <div className="settings-row-control" style={{ justifyContent: "flex-end" }}>
                  <label className="toggle-wrapper" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      className="toggle-checkbox"
                      checked={notificationsEnabled}
                      onChange={(e) => setNotificationsEnabled(e.target.checked)}
                    />
                    <div className="toggle-slider"></div>
                  </label>
                </div>
              </div>

              {/* Toggle 1: Notify on completion */}
              <div className="settings-row" style={!notificationsEnabled ? { opacity: 0.5, transition: "all 0.2s" } : { transition: "all 0.2s" }}>
                <div className="settings-row-info">
                  <label>Notify on Completion</label>
                  <p>Send a desktop alert as soon as you complete your target work hours.</p>
                </div>
                <div className="settings-row-control" style={{ justifyContent: "flex-end" }}>
                  <label className="toggle-wrapper" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      className="toggle-checkbox"
                      checked={notifyOnCompletion}
                      onChange={(e) => setNotifyOnCompletion(e.target.checked)}
                      disabled={!notificationsEnabled}
                    />
                    <div className="toggle-slider" style={!notificationsEnabled ? { opacity: 0.5, cursor: "not-allowed" } : {}}></div>
                  </label>
                </div>
              </div>

              {/* Toggle 2: Constant notifications */}
              <div className="settings-row" style={!notificationsEnabled ? { opacity: 0.5, transition: "all 0.2s" } : { transition: "all 0.2s" }}>
                <div className="settings-row-info">
                  <label>Periodic Progress Alerts</label>
                  <p>Receive constant updates of completed work time and remaining hours until complete.</p>
                </div>
                <div className="settings-row-control" style={{ justifyContent: "flex-end" }}>
                  <label className="toggle-wrapper" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      className="toggle-checkbox"
                      checked={notifyConstant}
                      onChange={(e) => setNotifyConstant(e.target.checked)}
                      disabled={!notificationsEnabled}
                    />
                    <div className="toggle-slider" style={!notificationsEnabled ? { opacity: 0.5, cursor: "not-allowed" } : {}}></div>
                  </label>
                </div>
              </div>

              {/* Select Option: Interval (Visible if Constant Notifications is checked) */}
              {notifyConstant && (
                <div className="settings-row animate-in" style={!notificationsEnabled ? { opacity: 0.5, transition: "all 0.2s" } : { transition: "all 0.2s" }}>
                  <div className="settings-row-info">
                    <label>Alert Interval</label>
                    <p>Choose how frequently you receive progress updates.</p>
                  </div>
                  <div className="settings-row-control">
                    <select
                      value={notifyInterval}
                      onChange={(e) => setNotifyInterval(Number(e.target.value))}
                      disabled={!notificationsEnabled}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid var(--card-border)",
                        background: "var(--card-bg)",
                        color: "var(--text-main)",
                        fontSize: "0.95rem",
                        width: "100%",
                        maxWidth: "320px",
                        cursor: notificationsEnabled ? "pointer" : "not-allowed",
                        outline: "none",
                        transition: "all 0.2s",
                      }}
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>
                </div>
              )}

            </div>
            <div className="settings-card-footer">
              <button
                type="submit"
                className="btn-primary"
                disabled={isSavingProfile}
              >
                {isSavingProfile ? <span className="spinner"></span> : "Save Preferences"}
              </button>
            </div>
          </form>
        </div>

        {/* Work Preferences Card */}
        <div className="glass-card settings-section animate-in delay-1">
          <div className="settings-section-header">
            <div className="title">
              <RiTimerLine size={20} />
              <h2>Work Preferences</h2>
            </div>
            <p>Customize your tracking experience and daily target hours.</p>
          </div>

          <form onSubmit={handleProfileSubmit}>
            <div className="settings-section-body">
              <div className="settings-row">
                <div className="settings-row-info">
                  <label>Time Format</label>
                  <p>Choose between 12-hour (AM/PM) and 24-hour display modes.</p>
                </div>
                <div className="settings-row-control">
                  <div className="radio-group row-radio">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="timeFormat"
                        value="12h"
                        checked={timeFormat === "12h"}
                        onChange={(e) => setTimeFormat(e.target.value)}
                      />
                      <span>12-hour</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="timeFormat"
                        value="24h"
                        checked={timeFormat === "24h"}
                        onChange={(e) => setTimeFormat(e.target.value)}
                      />
                      <span>24-hour</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-info">
                  <label>Work Duration</label>
                  <p>The daily quota of hours to track before hitting Overtime.</p>
                </div>
                <div className="settings-row-control">
                  <div className="dual-input">
                    <div className="input-half">
                      <span className="input-label-small">Hrs</span>
                      <input
                        type="number"
                        value={workHours}
                        onChange={(e) => setWorkHours(Number(e.target.value))}
                        min="0"
                        max="24"
                      />
                    </div>
                    <div className="input-half">
                      <span className="input-label-small">Min</span>
                      <input
                        type="number"
                        value={workMinutes}
                        onChange={(e) => setWorkMinutes(Number(e.target.value))}
                        min="0"
                        max="59"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-info">
                  <label>Break Time Quota</label>
                  <p>Total allocated break limit per day in minutes.</p>
                </div>
                <div className="settings-row-control">
                  <input
                    type="number"
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                    min="0"
                    style={{ maxWidth: "120px" }}
                  />
                </div>
              </div>

            </div>
            <div className="settings-card-footer">
              <button
                type="submit"
                className="btn-primary"
                disabled={isSavingProfile}
              >
                {isSavingProfile ? <span className="spinner"></span> : "Save Preferences"}
              </button>
            </div>
          </form>
        </div>

        {/* Security Card */}
        <div className="glass-card settings-section animate-in delay-2">
          <div className="settings-section-header">
            <div className="title">
              <RiLockPasswordLine size={20} />
              <h2>Security</h2>
            </div>
            <p>Update your password to ensure your account stays protected.</p>
          </div>

          <form onSubmit={handlePasswordSubmit}>
            <div className="settings-section-body">
              {passwordMessage.text && (
                <div className={`dm-message dm-message-${passwordMessage.type}`} style={{ marginBottom: "16px" }}>
                  {passwordMessage.type === "error" ? (
                    <RiErrorWarningLine className="dm-msg-icon" size={18} />
                  ) : (
                    <RiCheckboxCircleLine className="dm-msg-icon" size={18} />
                  )}
                  {passwordMessage.text}
                </div>
              )}

              <div className="settings-row">
                <div className="settings-row-info">
                  <label htmlFor="currentPassword">Current Password</label>
                  <p>Verify your identity by entering your current password.</p>
                </div>
                <div className="settings-row-control">
                  <div className="password-field-wrapper">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      id="currentPassword"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <RiEyeOffLine size={18} /> : <RiEyeLine size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-info">
                  <label htmlFor="newPassword">New Password</label>
                  <p>Must be at least 6 characters long.</p>
                </div>
                <div className="settings-row-control">
                  <div className="password-field-wrapper">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="New password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <RiEyeOffLine size={18} /> : <RiEyeLine size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-info">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <p>Please type your new password again.</p>
                </div>
                <div className="settings-row-control">
                  <div className="password-field-wrapper">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <RiEyeOffLine size={18} /> : <RiEyeLine size={18} />}
                    </button>
                  </div>
                </div>
              </div>

            </div>
            <div className="settings-card-footer">
              <button
                type="submit"
                className="btn-secondary"
                disabled={isSavingPassword}
              >
                {isSavingPassword ? <span className="spinner"></span> : "Update Password"}
              </button>
            </div>
          </form>
        </div>

      </div>

        {/* Events & Weekend Policy Card */}
        <div className="glass-card settings-section animate-in delay-2">
          <div className="settings-section-header">
            <div className="title">
              <RiCalendarEventLine size={20} />
              <h2>Events &amp; Weekend Policy</h2>
            </div>
            <p>Choose to follow admin-managed holidays and weekend schedule, or set your own custom policy.</p>
          </div>

          <div className="settings-section-body">
            {/* Toggle: Use Server Policy */}
            <div className="settings-row">
              <div className="settings-row-info">
                <label>Use Events &amp; Holidays from Server</label>
                <p>When enabled, holidays and weekend-off schedule managed by admin will apply. When disabled, you can define your own.</p>
              </div>
              <div className="settings-row-control" style={{ justifyContent: "flex-end" }}>
                <label className="toggle-wrapper" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    className="toggle-checkbox"
                    checked={useServerPolicy}
                    onChange={(e) => {
                      setUseServerPolicy(e.target.checked);
                      // Auto-save this preference
                      fetch("/api/user/profile", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ useServerPolicy: e.target.checked }),
                      }).then(() => {
                        window.dispatchEvent(
                          new CustomEvent("show-toast", {
                            detail: { message: e.target.checked ? "Using server policy" : "Using custom policy" },
                          })
                        );
                      });
                    }}
                  />
                  <div className="toggle-slider"></div>
                </label>
              </div>
            </div>

            {useServerPolicy && (
              <div className="settings-row" style={{ opacity: 0.7 }}>
                <div className="settings-row-info">
                  <label style={{ fontStyle: "italic" }}>Admin-managed</label>
                  <p>Your calendar uses holidays and weekend schedule set by your admin. No action needed.</p>
                </div>
              </div>
            )}

            {/* Custom Weekend Policy - shown when useServerPolicy is OFF */}
            {!useServerPolicy && (
              <>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Saturday Off Rule</label>
                    <p>Choose which Saturdays are off-days.</p>
                  </div>
                  <div className="settings-row-control">
                    <select
                      value={customSaturdayRule}
                      onChange={(e) => {
                        setCustomSaturdayRule(e.target.value);
                        if (e.target.value !== "custom") setCustomSaturdays([]);
                      }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid var(--card-border)",
                        background: "var(--card-bg)",
                        color: "var(--text-main)",
                        fontSize: "0.95rem",
                        width: "100%",
                        maxWidth: "320px",
                        cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      <option value="all">Every Saturday Off</option>
                      <option value="none">No Saturdays Off</option>
                      <option value="alternate_135">1st, 3rd &amp; 5th Saturdays Off</option>
                      <option value="alternate_24">2nd &amp; 4th Saturdays Off</option>
                      <option value="custom">Custom (select specific weeks)</option>
                    </select>
                  </div>
                </div>

                {customSaturdayRule === "custom" && (
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Off Saturdays (Week #)</label>
                      <p>Select which week numbers have Saturday off.</p>
                    </div>
                    <div className="settings-row-control">
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {[1, 2, 3, 4, 5].map((w) => (
                          <label key={w} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={customSaturdays.includes(w)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCustomSaturdays((prev) => [...prev, w].sort());
                                } else {
                                  setCustomSaturdays((prev) => prev.filter((v) => v !== w));
                                }
                              }}
                            />
                            Week {w}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {!useServerPolicy && (
            <div className="settings-card-footer">
              <button
                type="button"
                className="btn-primary"
                disabled={isSavingWeekendPolicy}
                onClick={async () => {
                  setIsSavingWeekendPolicy(true);
                  try {
                    await fetch("/api/user/weekend-policy", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        sundayOff: true,
                        saturdayRule: customSaturdayRule,
                        customSaturdays,
                      }),
                    });
                    window.dispatchEvent(
                      new CustomEvent("show-toast", {
                        detail: { message: "Weekend policy saved!" },
                      })
                    );
                  } catch {
                    alert("Failed to save weekend policy");
                  } finally {
                    setIsSavingWeekendPolicy(false);
                  }
                }}
              >
                {isSavingWeekendPolicy ? <span className="spinner"></span> : "Save Weekend Policy"}
              </button>
            </div>
          )}
        </div>

        {/* Custom Holidays Card - Only shown when useServerPolicy is OFF */}
        {!useServerPolicy && (
          <div className="glass-card settings-section animate-in delay-2">
            <div className="settings-section-header">
              <div className="title">
                <RiCalendarEventLine size={20} />
                <h2>Custom Holidays</h2>
              </div>
              <p>Add your own holidays and events. These will be shown on your calendar instead of admin-managed ones.</p>
            </div>

            <div className="settings-section-body">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newHolName || !newHolDate) return;
                  const durationMinutes = newHolType === "full" ? null : newHolDurationH * 60 + newHolDurationM;

                  try {
                    if (editingHolId) {
                      await fetch(`/api/user/holidays/${editingHolId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newHolName, date: newHolDate, durationMinutes }),
                      });
                    } else {
                      await fetch("/api/user/holidays", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newHolName, date: newHolDate, durationMinutes }),
                      });
                    }

                    // Refresh list
                    const res = await fetch("/api/user/holidays");
                    const data = await res.json();
                    setUserHolidays(Array.isArray(data) ? data : []);

                    // Reset form
                    setNewHolName("");
                    setNewHolDate("");
                    setNewHolType("full");
                    setNewHolDurationH(0);
                    setNewHolDurationM(0);
                    setEditingHolId(null);

                    window.dispatchEvent(
                      new CustomEvent("show-toast", {
                        detail: { message: editingHolId ? "Holiday updated!" : "Holiday added!" },
                      })
                    );
                  } catch {
                    alert("Failed to save holiday");
                  }
                }}
                style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Holiday Name</label>
                    <input
                      type="text"
                      required
                      value={newHolName}
                      onChange={(e) => setNewHolName(e.target.value)}
                      placeholder="e.g. Personal Day"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Date</label>
                    <input
                      type="date"
                      required
                      value={newHolDate}
                      onChange={(e) => setNewHolDate(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Type</label>
                    <select
                      value={newHolType}
                      onChange={(e) => setNewHolType(e.target.value as "full" | "partial")}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid var(--card-border)",
                        background: "var(--card-bg)",
                        color: "var(--text-main)",
                        fontSize: "0.95rem",
                        width: "100%",
                        cursor: "pointer",
                      }}
                    >
                      <option value="full">Full Day Off</option>
                      <option value="partial">Partial Day (Custom Hours)</option>
                    </select>
                  </div>
                  {newHolType === "partial" && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Duration</label>
                      <div className="duration-inputs">
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={newHolDurationH}
                          onChange={(e) => setNewHolDurationH(parseInt(e.target.value) || 0)}
                          placeholder="Hrs"
                        />
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={newHolDurationM}
                          onChange={(e) => setNewHolDurationM(parseInt(e.target.value) || 0)}
                          placeholder="Mins"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  {editingHolId && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setEditingHolId(null);
                        setNewHolName("");
                        setNewHolDate("");
                        setNewHolType("full");
                        setNewHolDurationH(0);
                        setNewHolDurationM(0);
                      }}
                      style={{ padding: "8px 16px" }}
                    >
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="btn-primary" style={{ padding: "8px 16px" }}>
                    {editingHolId ? "Update Holiday" : "Add Holiday"}
                  </button>
                </div>
              </form>

              {/* Holiday List */}
              {isLoadingHolidays ? (
                <div className="page-loader" style={{ minHeight: "60px" }}>
                  <div className="loader-spinner" />
                </div>
              ) : userHolidays.length === 0 ? (
                <p className="text-muted" style={{ textAlign: "center", padding: "16px", fontStyle: "italic" }}>
                  No custom holidays added yet.
                </p>
              ) : (
                <table className="session-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userHolidays.map((h) => (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 600 }}>{h.name}</td>
                        <td>{h.date ? h.date.split("T")[0] : ""}</td>
                        <td>
                          {h.durationMinutes === null ? (
                            <span className="status-badge holiday-full">Full Day</span>
                          ) : (
                            <span className="status-badge holiday-partial">
                              Partial ({Math.floor(h.durationMinutes / 60)}h {h.durationMinutes % 60}m)
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                              onClick={() => {
                                setEditingHolId(h.id);
                                setNewHolName(h.name);
                                setNewHolDate(h.date ? h.date.split("T")[0] : "");
                                if (h.durationMinutes === null) {
                                  setNewHolType("full");
                                  setNewHolDurationH(0);
                                  setNewHolDurationM(0);
                                } else {
                                  setNewHolType("partial");
                                  setNewHolDurationH(Math.floor(h.durationMinutes / 60));
                                  setNewHolDurationM(h.durationMinutes % 60);
                                }
                              }}
                            >
                              <RiEdit2Line size={14} />
                            </button>
                            <button
                              className="btn-secondary btn-delete-sm"
                              style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                              onClick={async () => {
                                if (!confirm(`Delete holiday: ${h.name}?`)) return;
                                await fetch(`/api/user/holidays/${h.id}`, { method: "DELETE" });
                                setUserHolidays((prev) => prev.filter((x) => x.id !== h.id));
                              }}
                            >
                              <RiDeleteBinLine size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

    </div>
  );
}
