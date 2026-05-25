"use client";

import { useEffect, useState } from "react";
import { RiNotification3Line, RiCloseLine } from "@remixicon/react";
import { useSession } from "next-auth/react";
import { vibeClient } from "@/lib/vibe-client";

interface AppNotification {
  id: string;
  message: string;
}

export default function NotificationBanner() {
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const { status } = useSession();

  useEffect(() => {
    const handleLocalToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      const newToast: AppNotification = {
        id: Date.now().toString(),
        message: customEvent.detail.message || "Action completed successfully!",
      };
      setToasts((prev) => [...prev, newToast]);
    };

    window.addEventListener("show-toast", handleLocalToast);
    return () => {
      window.removeEventListener("show-toast", handleLocalToast);
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;

    if (vibeClient) {
      vibeClient.onMessage((payload) => {
        // Format payload to match our AppNotification type
        const newToast: AppNotification = {
          id: Date.now().toString(),
          message: payload.body || payload.title,
        };
        
        setToasts((prev) => [...prev, newToast]);

        // Trigger desktop notifications if permitted, and page is not in view
        if (
          "Notification" in window &&
          Notification.permission === "granted" &&
          document.visibilityState !== "visible"
        ) {
          new Notification(payload.title || "WorkTracker Alert", { 
            body: payload.body || payload.title 
          });
        }
      });

      vibeClient.onBackgroundMessage((payload) => {
        // Handle when user clicks a background notification and it opens/focuses the app
        console.log("Background Notification Clicked:", payload);
      });
    }
  }, [status]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (status !== "authenticated") return null;

  return (
    <>
      {/* Stackable Toasts for ONE_TIME notifications (bottom right) */}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            zIndex: 9999,
          }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="glass-card animate-in"
              style={{
                padding: "16px",
                minWidth: "300px",
                maxWidth: "400px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                borderLeft: "4px solid var(--accent-primary)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{ color: "var(--accent-primary)", marginTop: "2px" }}
                >
                  <RiNotification3Line size={20} />
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      marginBottom: "4px",
                    }}
                  >
                    New Notification
                  </div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.4,
                    }}
                  >
                    {toast.message}
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                  marginTop: "-4px",
                  marginRight: "-8px",
                }}
              >
                <RiCloseLine size={20} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
