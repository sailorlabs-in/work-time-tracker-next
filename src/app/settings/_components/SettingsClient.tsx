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
} from "@remixicon/react";

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
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setIsLoadingProfile(false);
      }
    }
    fetchProfile();
  }, [session]);

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
    </div>
  );
}
