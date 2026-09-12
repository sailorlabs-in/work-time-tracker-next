import React, { useState } from "react";
import {
  RiNotification3Line,
  RiTimeLine,
  RiCheckLine,
  RiRocketLine,
  RiCupLine,
  RiDeleteBinLine,
} from "@remixicon/react";
import { CustomNotification } from "@/hooks/useWorkTimer";

interface TodayNotificationsCardProps {
  customNotifications: CustomNotification[];
  addCustomNotification: (
    type: "time" | "complete" | "overtime" | "punch_out",
    value: string,
    title?: string,
  ) => void;
  deleteCustomNotification: (id: string) => void;
}

export default function TodayNotificationsCard({
  customNotifications,
  addCustomNotification,
  deleteCustomNotification,
}: TodayNotificationsCardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNotifType, setNewNotifType] = useState<
    "time" | "complete" | "overtime" | "punch_out"
  >("time");
  const [newNotifValue, setNewNotifValue] = useState("18:00");
  const [newNotifTitle, setNewNotifTitle] = useState("");
  const [formError, setFormError] = useState("");

  const handleAddNotificationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotifValue) {
      setFormError("Value is required.");
      return;
    }
    if (
      newNotifType === "complete" ||
      newNotifType === "overtime" ||
      newNotifType === "punch_out"
    ) {
      const parts = newNotifValue.split(":");
      if (
        parts.length !== 2 ||
        isNaN(Number(parts[0])) ||
        isNaN(Number(parts[1]))
      ) {
        setFormError("Format must be HH:MM.");
        return;
      }
    }
    addCustomNotification(
      newNotifType,
      newNotifValue,
      newNotifType === "time" ? newNotifTitle || "Clock Time Alert" : undefined,
    );
    setNewNotifValue("");
    setNewNotifTitle("");
    setFormError("");
    setShowAddForm(false);
  };

  return (
    <div className="notes-card glass-card animate-in">
      <div className="notif-header">
        <div className="notif-header-left">
          <span className="notes-header-icon">
            <RiNotification3Line size={20} />
          </span>
          <span className="notes-title">Today&apos;s Notifications</span>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-add-alert"
          >
            + Add Alert
          </button>
        )}
      </div>
      <div className="notif-body">
        {showAddForm && (
          <form
            onSubmit={handleAddNotificationSubmit}
            className="notif-add-form"
          >
            {formError && (
              <div className="notif-form-error">
                {formError}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="notifType">Alert Type</label>
              <select
                id="notifType"
                className="notif-select"
                value={newNotifType}
                onChange={(e) => {
                  const type = e.target.value as "time" | "complete" | "overtime" | "punch_out";
                  setNewNotifType(type);
                  setFormError("");
                  if (type === "time") {
                    setNewNotifValue("18:00");
                  } else if (type === "complete") {
                    setNewNotifValue("08:00");
                  } else if (type === "overtime") {
                    setNewNotifValue("01:00");
                  } else if (type === "punch_out") {
                    setNewNotifValue("00:15");
                  }
                }}
              >
                <option value="time">Notify me at (local time)</option>
                <option value="complete">
                  Notify when completed (duration)
                </option>
                <option value="overtime">
                  Notify when Overtime reaches (duration)
                </option>
                <option value="punch_out">
                  Notify when Punched Out for more than
                </option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="notifValue">
                {newNotifType === "time" ? "Clock Time" : "Duration (HH:MM)"}
              </label>
              <input
                id="notifValue"
                type={newNotifType === "time" ? "time" : "text"}
                placeholder={
                  newNotifType === "time" ? undefined : "e.g. 08:00 or 00:15"
                }
                value={newNotifValue}
                onChange={(e) => setNewNotifValue(e.target.value)}
                required
              />
            </div>

            {newNotifType === "time" && (
              <div className="form-group">
                <label htmlFor="notifTitle">Title / Reason</label>
                <input
                  id="notifTitle"
                  type="text"
                  placeholder="e.g. Go home, Standup meeting"
                  value={newNotifTitle}
                  onChange={(e) => setNewNotifTitle(e.target.value)}
                />
              </div>
            )}

            <div className="notif-form-actions">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewNotifValue("");
                  setNewNotifTitle("");
                  setFormError("");
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
              >
                Save Alert
              </button>
            </div>
          </form>
        )}

        {/* List of active/fired custom notifications */}
        <div className="notif-list">
          {customNotifications.length === 0 ? (
            <div className="notif-empty">
              No custom notifications set for today.
            </div>
          ) : (
            customNotifications.map((notif) => {
              let icon = <RiTimeLine size={16} className="stat-icon" />;
              let text = "";

              if (notif.type === "time") {
                icon = <RiTimeLine size={16} className="stat-icon" />;
                text = `Notify at ${notif.value} for reason: ${notif.title || "Clock Time Alert"}`;
              } else if (notif.type === "complete") {
                icon = <RiCheckLine size={16} className="stat-icon stat-icon-success" />;
                text = `You completed your ${notif.value} time`;
              } else if (notif.type === "overtime") {
                icon = <RiRocketLine size={16} className="stat-icon stat-icon-warning" />;
                text = `You completed Overtime of ${notif.value} time`;
              } else if (notif.type === "punch_out") {
                icon = <RiCupLine size={16} className="stat-icon stat-icon-accent" />;
                text = `Notify when punched out more than ${notif.value} mins`;
              }

              return (
                <div
                  key={notif.id}
                  className={`notif-item ${notif.hasFired ? "fired" : ""}`}
                >
                  <div className="notif-item-content">
                    {icon}
                    <span className="notif-item-text" title={text}>
                      {text}
                    </span>
                    {notif.hasFired && (
                      <span className="notif-badge-fired">
                        Sent
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteCustomNotification(notif.id)}
                    className="notif-delete-btn"
                    title="Delete notification"
                  >
                    <RiDeleteBinLine size={15} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
