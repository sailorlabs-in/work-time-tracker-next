"use client";

import { useState, useEffect } from "react";
import {
  RiShieldStarLine,
  RiNotification3Line,
  RiCalendarLine,
  RiUserAddLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiCalendarEventLine,
  RiRefreshLine,
  RiDatabase2Line,
} from "@remixicon/react";
import CalendarClient from "@/app/calendar/_components/CalendarClient";

type Tab = "timelogs" | "notifications" | "admins" | "holidays" | "sync";

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  workHours: number;
  workMinutes: number;
  createdAt: string;
};

export default function AdminClient({
  currentUserId,
  timeFormat,
}: {
  currentUserId: string;
  timeFormat?: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("timelogs");

  return (
    <div className="admin-container">
      <div className="admin-header" style={{ marginBottom: "24px" }}>
        <h1>
          <RiShieldStarLine
            style={{
              display: "inline",
              verticalAlign: "bottom",
              marginRight: "8px",
            }}
            size={28}
          />
          Admin Panel
        </h1>
        <p className="text-muted">
          Manage users, view timelogs, and send notifications.
        </p>
      </div>

      <div className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === "timelogs" ? "active" : ""}`}
          onClick={() => setActiveTab("timelogs")}
        >
          <RiCalendarLine size={18} /> User Timelogs
        </button>
        <button
          className={`tab-btn ${activeTab === "notifications" ? "active" : ""}`}
          onClick={() => setActiveTab("notifications")}
        >
          <RiNotification3Line size={18} /> Announcements
        </button>
        <button
          className={`tab-btn ${activeTab === "admins" ? "active" : ""}`}
          onClick={() => setActiveTab("admins")}
        >
          <RiUserAddLine size={18} /> Access Control
        </button>
        <button
          className={`tab-btn ${activeTab === "holidays" ? "active" : ""}`}
          onClick={() => setActiveTab("holidays")}
        >
          <RiCalendarEventLine size={18} /> Holidays
        </button>
        <button
          className={`tab-btn ${activeTab === "sync" ? "active" : ""}`}
          onClick={() => setActiveTab("sync")}
        >
          <RiDatabase2Line size={18} /> Database Sync
        </button>
      </div>

      <div className="admin-content">
        {activeTab === "timelogs" && <UserTimelogsTab timeFormat={timeFormat} />}
        {activeTab === "notifications" && <PushNotificationsTab />}
        {activeTab === "admins" && <AdminsTab currentUserId={currentUserId} />}
        {activeTab === "holidays" && <ManageHolidaysTab />}
        {activeTab === "sync" && <DatabaseSyncTab />}
      </div>
    </div>
  );
}

function UserTimelogsTab({ timeFormat }: { timeFormat?: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      });
  }, []);

  if (loading)
    return (
      <div className="page-loader">
        <div className="loader-spinner" />
      </div>
    );

  return (
    <div className="glass-card animate-in">
      <h2>Select User to View Timelogs</h2>
      {selectedUser ? (
        <div className="admin-calendar-view" style={{ marginTop: "16px" }}>
          <button
            className="btn-secondary"
            onClick={() => setSelectedUser(null)}
            style={{ marginBottom: "16px" }}
          >
            ← Back to Users
          </button>
          <div style={{ margin: "0 -20px" }}>
            <CalendarClient 
              initialEvents={[]} 
              adminUserId={selectedUser.id} 
              timeFormat={timeFormat} 
              workDurationMs={(selectedUser.workHours * 3600000) + (selectedUser.workMinutes * 60000)}
            />
          </div>
        </div>
      ) : (
        <table className="session-table" style={{ marginTop: "16px" }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Joined</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name || "N/A"}{" "}
                  {u.isAdmin && (
                    <span
                      className="status-badge working"
                      style={{
                        marginLeft: "8px",
                        padding: "2px 6px",
                        fontSize: "0.6rem",
                      }}
                    >
                      Admin
                    </span>
                  )}
                </td>
                <td>{u.email}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    className="btn-primary"
                    style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                    onClick={() => setSelectedUser(u)}
                  >
                    View Logs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PushNotificationsTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [targetUserId, setTargetUserId] = useState("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: "", text: "" });

  useEffect(() => {
    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => setUsers(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: "", text: "" });

    try {
      const uids =
        targetUserId === "all" ? users.map((u) => u.id) : [targetUserId];

      const promises = uids.map((uid) =>
        fetch("/api/admin/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid, message }),
        }),
      );

      await Promise.all(promises);
      setStatus({
        type: "success",
        text: `Notification sent to ${uids.length} user(s)!`,
      });
      setMessage("");
    } catch {
      setStatus({ type: "error", text: "Failed to send notification." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="glass-card animate-in"
      style={{ padding: "32px", maxWidth: "700px" }}
    >
      <div style={{ marginBottom: "24px" }}>
        <h2
          style={{
            fontSize: "1.5rem",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <RiNotification3Line size={24} color="var(--accent-primary)" /> Send
          Announcement
        </h2>
        <p className="text-muted">
          Push a real-time notification to your team members.
        </p>
      </div>

      {status.text && (
        <div
          className={`dm-message dm-message-${status.type}`}
          style={{ marginBottom: "24px" }}
        >
          {status.type === "error" ? (
            <RiErrorWarningLine size={20} />
          ) : (
            <RiCheckLine size={20} />
          )}
          {status.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="settings-form">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label
              style={{
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "var(--text-main)",
              }}
            >
              Target User
            </label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid var(--card-border)",
                background: "var(--input-bg)",
                color: "var(--text-main)",
                fontSize: "0.95rem",
              }}
            >
              <option value="all">Everyone (All Users)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: "24px" }}>
          <label
            style={{
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "var(--text-main)",
            }}
          >
            Message Content
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={5}
            placeholder="Type your announcement here... It will show up instantly for users."
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid var(--card-border)",
              background: "var(--input-bg)",
              color: "var(--text-main)",
              resize: "vertical",
              fontSize: "1rem",
              lineHeight: 1.5,
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !message}
            style={{
              padding: "12px 24px",
              fontSize: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {loading ? (
              <span
                className="spinner"
                style={{ width: "20px", height: "20px" }}
              ></span>
            ) : (
              <>
                <RiNotification3Line size={20} /> Send Notification
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminsTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = () => {
    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleGrantAdmin = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to grant Admin privileges to ${name || "this user"}?`,
      )
    )
      return;

    try {
      await fetch(`/api/admin/users/${id}/grant`, { method: "PUT" });
      fetchUsers(); // refresh
    } catch {
      alert("Failed to grant admin");
    }
  };

  const handleRevokeAdmin = async (id: string, name: string) => {
    if (id === currentUserId) {
      alert("You cannot revoke your own admin access.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to revoke Admin privileges from ${name || "this user"}?`,
      )
    )
      return;

    try {
      await fetch(`/api/admin/users/${id}/revoke`, { method: "PUT" });
      fetchUsers(); // refresh
    } catch {
      alert("Failed to revoke admin");
    }
  };

  if (loading)
    return (
      <div className="page-loader">
        <div className="loader-spinner" />
      </div>
    );

  return (
    <div className="glass-card animate-in">
      <h2>Access Control</h2>
      <p className="text-muted" style={{ marginBottom: "20px" }}>
        Manage which users have access to this Admin Panel.
      </p>

      <table className="session-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{u.name || "Unknown"}</div>
                <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                  {u.email}
                </div>
              </td>
              <td>
                {u.isAdmin ? (
                  <span className="status-badge working">Admin</span>
                ) : (
                  <span
                    className="status-badge on-break"
                    style={{
                      background: "var(--slate-bg)",
                      color: "var(--text-muted)",
                    }}
                  >
                    User
                  </span>
                )}
              </td>
              <td>
                <div
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                >
                  {!u.isAdmin && (
                    <button
                      className="btn-secondary"
                      style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                      onClick={() => handleGrantAdmin(u.id, u.name || u.email)}
                    >
                      Grant Admin
                    </button>
                  )}
                  {u.isAdmin && u.id !== currentUserId && (
                    <button
                      className="btn-secondary"
                      style={{
                        padding: "6px 12px",
                        fontSize: "0.8rem",
                        color: "var(--danger)",
                        borderColor: "rgba(229,77,77,0.3)",
                      }}
                      onClick={() => handleRevokeAdmin(u.id, u.name || u.email)}
                    >
                      Revoke
                    </button>
                  )}
                  {u.id === currentUserId && (
                    <span
                      className="text-muted"
                      style={{ fontSize: "0.8rem", fontStyle: "italic" }}
                    >
                      {" "}
                      (You)
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Holiday = {
  id: string;
  name: string;
  date: string;
  durationMinutes: number | null;
  createdAt: string;
};

function ManageHolidaysTab() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"full" | "partial">("full");
  const [durationHours, setDurationHours] = useState(0);
  const [durationMinutesStr, setDurationMinutesStr] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Weekend policy state
  const [sundayOff, setSundayOff] = useState(true);
  const [saturdayRule, setSaturdayRule] = useState("alternate_135");
  const [customSaturdays, setCustomSaturdays] = useState<number[]>([]);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyMsg, setPolicyMsg] = useState("");

  const fetchHolidays = () => {
    fetch("/api/admin/holidays")
      .then((res) => res.json())
      .then((data) => {
        setHolidays(data);
        setLoading(false);
      });
  };

  const fetchWeekendPolicy = () => {
    fetch("/api/admin/weekend-policy")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setSundayOff(data.sundayOff ?? true);
          setSaturdayRule(data.saturdayRule || "alternate_135");
          setCustomSaturdays(data.customSaturdays || []);
        }
      });
  };

  useEffect(() => {
    fetchHolidays();
    fetchWeekendPolicy();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const durationMinutes =
        type === "full" ? null : durationHours * 60 + durationMinutesStr;
      
      const url = editingId ? `/api/admin/holidays/${editingId}` : "/api/admin/holidays";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, date, durationMinutes }),
      });

      if (res.ok) {
        setName("");
        setDate("");
        setType("full");
        setDurationHours(0);
        setDurationMinutesStr(0);
        setEditingId(null);
        fetchHolidays();
      } else {
        alert(editingId ? "Failed to update holiday" : "Failed to create holiday");
      }
    } catch {
      alert(editingId ? "Error updating holiday" : "Error creating holiday");
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (h: Holiday) => {
    setEditingId(h.id);
    setName(h.name);
    const dateVal = h.date ? h.date.split("T")[0] : "";
    setDate(dateVal);
    if (h.durationMinutes === null) {
      setType("full");
      setDurationHours(0);
      setDurationMinutesStr(0);
    } else {
      setType("partial");
      setDurationHours(Math.floor(h.durationMinutes / 60));
      setDurationMinutesStr(h.durationMinutes % 60);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName("");
    setDate("");
    setType("full");
    setDurationHours(0);
    setDurationMinutesStr(0);
  };

  const handleDelete = async (id: string, holidayName: string) => {
    if (!confirm(`Are you sure you want to delete the holiday: ${holidayName}?`)) return;

    try {
      await fetch(`/api/admin/holidays/${id}`, { method: "DELETE" });
      if (editingId === id) {
        handleCancelEdit();
      }
      fetchHolidays();
    } catch {
      alert("Failed to delete holiday");
    }
  };

  if (loading && holidays.length === 0)
    return (
      <div className="page-loader">
        <div className="loader-spinner" />
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Global Weekend Policy Card */}
      <div className="glass-card animate-in">
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "4px" }}>
          Global Weekend Off Policy
        </h2>
        <p className="text-muted" style={{ marginBottom: "20px", fontSize: "0.9rem" }}>
          Configure the company-wide weekend off policy for users following server settings.
        </p>

        {policyMsg && (
          <div className="dm-message dm-message-success" style={{ marginBottom: "20px" }}>
            <RiCheckLine size={18} /> {policyMsg}
          </div>
        )}

        <form
          className="manage-holidays-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingPolicy(true);
            setPolicyMsg("");
            try {
              const res = await fetch("/api/admin/weekend-policy", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sundayOff, saturdayRule, customSaturdays }),
              });
              if (res.ok) {
                setPolicyMsg("Weekend policy saved successfully!");
              } else {
                alert("Failed to update policy");
              }
            } catch {
              alert("Error saving policy");
            } finally {
              setSavingPolicy(false);
            }
          }}
        >
          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "8px" }}>Saturday Off Rule</label>
            <select
              value={saturdayRule}
              onChange={(e) => {
                setSaturdayRule(e.target.value);
                if (e.target.value !== "custom") setCustomSaturdays([]);
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid var(--card-border)",
                background: "var(--input-bg)",
                color: "var(--text-main)",
                fontSize: "0.95rem",
                minHeight: "44px",
                outline: "none",
              }}
            >
              <option value="all">Every Saturday Off</option>
              <option value="none">No Saturdays Off</option>
              <option value="alternate_135">1st, 3rd &amp; 5th Saturdays Off</option>
              <option value="alternate_24">2nd &amp; 4th Saturdays Off</option>
              <option value="custom">Custom Saturdays (select week #)</option>
            </select>
          </div>

          {saturdayRule === "custom" && (
            <div className="form-group" style={{ marginTop: "16px", marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "10px" }}>Select Off Saturdays (Week # of Month)</label>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((w) => (
                  <label
                    key={w}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--card-border)",
                      background: customSaturdays.includes(w) ? "rgba(99, 102, 241, 0.15)" : "var(--input-bg)",
                      borderColor: customSaturdays.includes(w) ? "var(--accent-primary)" : "var(--card-border)",
                      color: customSaturdays.includes(w) ? "var(--accent-primary)" : "var(--text-main)",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
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
                      style={{ width: "auto", margin: 0, cursor: "pointer" }}
                    />
                    Week {w} Saturday
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions" style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={savingPolicy}
              style={{ padding: "10px 24px", fontSize: "0.95rem", fontWeight: 600 }}
            >
              {savingPolicy ? "Saving Policy..." : "Save Weekend Policy"}
            </button>
          </div>
        </form>
      </div>

      {/* Holidays List & Add Card */}
      <div className="glass-card animate-in">
        <h2>Manage Holidays</h2>
        <p className="text-muted" style={{ marginBottom: "20px" }}>
          Add global holidays that reflect on every user&apos;s calendar.
        </p>

      <form onSubmit={handleSubmit} className="manage-holidays-form">
        <div className="holidays-form-row">
          <div className="form-group">
            <label>Holiday Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New Year"
            />
          </div>
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="holidays-form-row">
          <div className="form-group">
            <label>Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "full" | "partial")}
            >
              <option value="full">Full Day (All work counts as OT)</option>
              <option value="partial">Partial Day (Custom Work Hours)</option>
            </select>
          </div>

          {type === "partial" && (
            <div className="form-group">
              <label>Holiday Duration</label>
              <div className="duration-inputs">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={durationHours}
                  onChange={(e) => setDurationHours(parseInt(e.target.value) || 0)}
                  placeholder="Hrs"
                />
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={durationMinutesStr}
                  onChange={(e) => setDurationMinutesStr(parseInt(e.target.value) || 0)}
                  placeholder="Mins"
                />
              </div>
            </div>
          )}
        </div>

        <div className="form-actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          {editingId && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCancelEdit}
              style={{ padding: "10px 20px" }}
            >
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={loading} style={{ padding: "10px 20px" }}>
            {loading ? (editingId ? "Updating..." : "Adding...") : (editingId ? "Update Holiday" : "Add Holiday")}
          </button>
        </div>
      </form>

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
          {holidays?.map((h) => (
            <tr key={h.id}>
              <td style={{ fontWeight: 600 }}>{h.name}</td>
              <td>
                {(() => {
                  if (!h.date) return "";
                  const dateStr = h.date.split("T")[0];
                  if (!dateStr.includes("-")) return new Date(h.date).toLocaleDateString();
                  const [y, m, d] = dateStr.split("-");
                  return `${y}-${m}-${d}`;
                })()}
              </td>
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
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    className="btn-secondary"
                    style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                    onClick={() => handleEditClick(h)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-secondary btn-delete-sm"
                    onClick={() => handleDelete(h.id, h.name)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {holidays.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: "center", fontStyle: "italic", padding: "20px" }}>No holidays found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}

type SyncMode = "24h" | "range" | "full";

interface SyncResponseData {
  success?: boolean;
  message?: string;
  error?: string;
  details?: string;
  direction?: string;
  syncType?: string;
  timeRange?: {
    startDate: string;
    endDate: string;
  };
  syncedCounts?: {
    users: number;
    holidays: number;
    weekendPolicies: number;
    userWeekendPolicies: number;
    userHolidays: number;
    workLogs: number;
    timerStates: number;
    notifications: number;
    dayNotes: number;
  };
}

function DatabaseSyncTab() {
  const [direction, setDirection] = useState<"prod-to-dev" | "dev-to-prod">("prod-to-dev");
  const [syncMode, setSyncMode] = useState<SyncMode>("24h");

  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(yesterdayStr);
  const [endDate, setEndDate] = useState(todayStr);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "";
    text: string;
    details?: SyncResponseData;
  }>({ type: "", text: "" });

  const handleSyncTrigger = async () => {
    if (syncMode === "range" && startDate && endDate && startDate > endDate) {
      alert("Start date cannot be after end date.");
      return;
    }

    const dirLabel =
      direction === "prod-to-dev"
        ? "Production → Development"
        : "Development → Production";
    const modeLabel =
      syncMode === "24h"
        ? "Last 24 Hours data"
        : syncMode === "range"
        ? `Custom Range (${startDate} to ${endDate})`
        : "FULL Database (All records)";

    if (
      !confirm(
        `Are you sure you want to trigger database synchronization?\n\n` +
          `Direction: ${dirLabel}\n` +
          `Scope: ${modeLabel}\n\n` +
          (syncMode === "full"
            ? "⚠️ WARNING: Full sync will overwrite target database tables!"
            : "This will migrate matching records into the target database.")
      )
    ) {
      return;
    }

    setLoading(true);
    setStatus({ type: "", text: "" });

    try {
      const payload: {
        direction: "prod-to-dev" | "dev-to-prod";
        fullSync: boolean;
        startDate?: string;
        endDate?: string;
      } = {
        direction,
        fullSync: syncMode === "full",
      };

      if (syncMode === "range") {
        payload.startDate = startDate;
        payload.endDate = endDate;
      }

      const res = await fetch("/api/cron/sync-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: SyncResponseData = await res.json();

      if (!res.ok || data.error) {
        setStatus({
          type: "error",
          text: data.error || "Database synchronization failed",
          details: data,
        });
      } else {
        setStatus({
          type: "success",
          text: data.message || "Database synchronization completed successfully!",
          details: data,
        });
      }
    } catch (err: unknown) {
      setStatus({
        type: "error",
        text: "Failed to communicate with sync endpoint",
        details: { details: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card animate-in" style={{ padding: "32px", maxWidth: "800px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h2
          style={{
            fontSize: "1.5rem",
            marginBottom: "8px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <RiDatabase2Line size={24} color="var(--accent-primary)" />
          Database Sync & Migration
        </h2>
        <p className="text-muted">
          Migrate data between Production and Development databases with customizable range options.
        </p>
      </div>

      {status.text && (
        <div
          className={`dm-message dm-message-${status.type}`}
          style={{
            marginBottom: "24px",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
            {status.type === "error" ? <RiErrorWarningLine size={20} /> : <RiCheckLine size={20} />}
            {status.text}
          </div>
          {status.details?.details && (
            <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>{status.details.details}</div>
          )}
          {status.details?.syncedCounts && (
            <div
              style={{
                marginTop: "8px",
                padding: "12px",
                background: "rgba(0,0,0,0.1)",
                borderRadius: "8px",
                width: "100%",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>Synced Records Summary:</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px" }}>
                <div>👥 Users: {status.details.syncedCounts.users}</div>
                <div>⏱️ Work Logs: {status.details.syncedCounts.workLogs}</div>
                <div>⌛ Timer States: {status.details.syncedCounts.timerStates}</div>
                <div>📝 Day Notes: {status.details.syncedCounts.dayNotes}</div>
                <div>🎉 Holidays: {status.details.syncedCounts.holidays}</div>
                <div>🏖️ User Holidays: {status.details.syncedCounts.userHolidays}</div>
                <div>📅 Weekend Policies: {status.details.syncedCounts.weekendPolicies}</div>
                <div>👤 User Weekend: {status.details.syncedCounts.userWeekendPolicies}</div>
                <div>🔔 Notifications: {status.details.syncedCounts.notifications}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sync Direction Selection */}
      <div className="form-group" style={{ marginBottom: "28px" }}>
        <label style={{ fontWeight: 600, fontSize: "0.95rem", display: "block", marginBottom: "12px" }}>
          1. Select Sync Direction
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div
            onClick={() => setDirection("prod-to-dev")}
            style={{
              padding: "16px",
              borderRadius: "12px",
              border: "2px solid",
              borderColor: direction === "prod-to-dev" ? "var(--accent-primary)" : "var(--card-border)",
              background: direction === "prod-to-dev" ? "rgba(99, 102, 241, 0.08)" : "var(--input-bg)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-main)", marginBottom: "4px" }}>
              Prod → Dev
            </div>
            <div style={{ fontSize: "0.85rem" }} className="text-muted">
              Copy live production data to development/backup database
            </div>
          </div>

          <div
            onClick={() => setDirection("dev-to-prod")}
            style={{
              padding: "16px",
              borderRadius: "12px",
              border: "2px solid",
              borderColor: direction === "dev-to-prod" ? "var(--accent-primary)" : "var(--card-border)",
              background: direction === "dev-to-prod" ? "rgba(99, 102, 241, 0.08)" : "var(--input-bg)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-main)", marginBottom: "4px" }}>
              Dev → Prod
            </div>
            <div style={{ fontSize: "0.85rem" }} className="text-muted">
              Copy dev/backup database data to production database
            </div>
          </div>
        </div>
      </div>

      {/* Sync Scope Selection */}
      <div className="form-group" style={{ marginBottom: "28px" }}>
        <label style={{ fontWeight: 600, fontSize: "0.95rem", display: "block", marginBottom: "12px" }}>
          2. Select Date Range Scope
        </label>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
          {[
            { id: "24h" as const, label: "Last 24 Hours (Default)" },
            { id: "range" as const, label: "Custom Date Range" },
            { id: "full" as const, label: "Full Database Sync" },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSyncMode(mode.id)}
              className={syncMode === mode.id ? "btn-primary" : "btn-secondary"}
              style={{ padding: "10px 18px", fontSize: "0.9rem" }}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {syncMode === "range" && (
          <div
            className="animate-in"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid var(--card-border)",
              background: "var(--input-bg)",
            }}
          >
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid var(--card-border)",
                  background: "var(--bg-main)",
                  color: "var(--text-main)",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid var(--card-border)",
                  background: "var(--bg-main)",
                  color: "var(--text-main)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleSyncTrigger}
          className="btn-primary"
          disabled={loading}
          style={{
            padding: "12px 28px",
            fontSize: "1rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {loading ? (
            <>
              <span className="spinner" style={{ width: "20px", height: "20px" }}></span>
              Syncing Database...
            </>
          ) : (
            <>
              <RiRefreshLine size={20} />
              Trigger One-Click Sync
            </>
          )}
        </button>
      </div>
    </div>
  );
}

