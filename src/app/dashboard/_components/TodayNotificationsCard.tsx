import React, { useState, useEffect } from "react";
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
      <div
        className="notes-header"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span className="notes-header-icon">
            <RiNotification3Line size={20} />
          </span>
          <span className="notes-title">Today&apos;s Notifications</span>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary"
            style={{
              padding: "4px 10px",
              fontSize: "0.75rem",
              borderRadius: "6px",
            }}
          >
            + Add Alert
          </button>
        )}
      </div>
      <div className="notes-body" style={{ padding: "16px 20px" }}>
        {showAddForm && (
          <form
            onSubmit={handleAddNotificationSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              marginBottom: "16px",
              paddingBottom: "16px",
              borderBottom: "1px solid var(--card-border)",
            }}
          >
            {formError && (
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--danger-color)",
                }}
              >
                {formError}
              </div>
            )}

            <div className="form-group" style={{ margin: 0 }}>
              <label
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  marginBottom: "4px",
                }}
              >
                Alert Type
              </label>
              <select
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
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--card-border)",
                  background: "var(--card-bg)",
                  color: "var(--text-main)",
                  fontSize: "0.85rem",
                  width: "100%",
                  outline: "none",
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

            <div className="form-group" style={{ margin: 0 }}>
              <label
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  marginBottom: "4px",
                }}
              >
                {newNotifType === "time" ? "Clock Time" : "Duration (HH:MM)"}
              </label>
              <input
                type={newNotifType === "time" ? "time" : "text"}
                placeholder={
                  newNotifType === "time" ? undefined : "e.g. 08:00 or 00:15"
                }
                value={newNotifValue}
                onChange={(e) => setNewNotifValue(e.target.value)}
                required
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--card-border)",
                  background: "var(--card-bg)",
                  color: "var(--text-main)",
                  fontSize: "0.85rem",
                  width: "100%",
                  outline: "none",
                }}
              />
            </div>

            {newNotifType === "time" && (
              <div className="form-group" style={{ margin: 0 }}>
                <label
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    marginBottom: "4px",
                  }}
                >
                  Title / Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Go home, Standup meeting"
                  value={newNotifTitle}
                  onChange={(e) => setNewNotifTitle(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--card-border)",
                    background: "var(--card-bg)",
                    color: "var(--text-main)",
                    fontSize: "0.85rem",
                    width: "100%",
                    outline: "none",
                  }}
                />
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                marginTop: "4px",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewNotifValue("");
                  setNewNotifTitle("");
                  setFormError("");
                }}
                className="btn-secondary"
                style={{
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  borderRadius: "6px",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  borderRadius: "6px",
                }}
              >
                Save Alert
              </button>
            </div>
          </form>
        )}

        {/* List of active/fired custom notifications */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {customNotifications.length === 0 ? (
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "10px 0",
              }}
            >
              No custom notifications set for today.
            </div>
          ) : (
            customNotifications.map((notif) => {
              let icon = (
                <RiTimeLine
                  size={16}
                  style={{ color: "var(--accent-primary)" }}
                />
              );
              let text = "";

              if (notif.type === "time") {
                icon = (
                  <RiTimeLine
                    size={16}
                    style={{ color: "var(--accent-primary)" }}
                  />
                );
                text = `Notify at ${notif.value} for reason: ${notif.title || "Clock Time Alert"}`;
              } else if (notif.type === "complete") {
                icon = (
                  <RiCheckLine
                    size={16}
                    style={{ color: "var(--success-color)" }}
                  />
                );
                text = `You completed your ${notif.value} time`;
              } else if (notif.type === "overtime") {
                icon = (
                  <RiRocketLine
                    size={16}
                    style={{ color: "var(--warning-color)" }}
                  />
                );
                text = `You completed Overtime of ${notif.value} time`;
              } else if (notif.type === "punch_out") {
                icon = (
                  <RiCupLine
                    size={16}
                    style={{ color: "var(--accent-secondary)" }}
                  />
                );
                text = `Notify when punched out more than ${notif.value} mins`;
              }

              return (
                <div
                  key={notif.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--card-border)",
                    opacity: notif.hasFired ? 0.6 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {icon}
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-main)",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                      title={text}
                    >
                      {text}
                    </span>
                    {notif.hasFired && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "rgba(0,0,0,0.2)",
                          color: "var(--text-muted)",
                        }}
                      >
                        Sent
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteCustomNotification(notif.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "color 0.2s",
                    }}
                    title="Delete notification"
                  >
                    <RiDeleteBinLine
                      size={14}
                      style={{ transition: "color 0.2s" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--danger-color)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--text-muted)")
                      }
                    />
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
