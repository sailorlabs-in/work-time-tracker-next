"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { RiCloseLine, RiMenuLine, RiShieldStarLine } from "@remixicon/react";
import { vibeClient } from "@/lib/vibe-client";
import { getAppName } from "@/lib/brand";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSignoutModalOpen, setIsSignoutModalOpen] = useState(false);

  if (!session) return null;

  const closeMenu = () => setIsMenuOpen(false);
  const openSignoutModal = () => {
    closeMenu();
    setIsSignoutModalOpen(true);
  };

  return (
    <nav className={`navbar ${isMenuOpen ? "navbar-menu-open" : ""}`}>
      <div className="navbar-inner">
        <Link href="/dashboard" className="navbar-brand" onClick={closeMenu}>
          <img src="/favicon.ico" alt="" className="brand-logo" />
          <span className="brand-text">{getAppName()}</span>
        </Link>

        <button
          type="button"
          className="navbar-menu-btn"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? <RiCloseLine size={22} /> : <RiMenuLine size={22} />}
        </button>

        <div className="navbar-menu-panel">
          <div className="navbar-links">
            <Link
              href="/dashboard"
              className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}
              onClick={closeMenu}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Dashboard
            </Link>
            <Link
              href="/calendar"
              className={`nav-link ${pathname === "/calendar" ? "active" : ""}`}
              onClick={closeMenu}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Calendar
            </Link>
            {session.user?.isAdmin && (
              <Link
                href="/admin"
                className={`nav-link ${pathname.startsWith("/admin") ? "active" : ""}`}
                onClick={closeMenu}
              >
                <RiShieldStarLine size={18} />
                Admin
              </Link>
            )}
          </div>

          <div className="navbar-right">
            <ThemeToggle />
            <div className="navbar-user">
              <Link
                href="/settings"
                className={`nav-link ${pathname === "/settings" ? "active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                onClick={closeMenu}
              >
                <span className="user-name">
                  {session.user?.name || session.user?.email}
                </span>
              </Link>
              <button onClick={openSignoutModal} className="btn-logout">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>

      {isSignoutModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsSignoutModalOpen(false)}
        >
          <div
            className="modal-card animate-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "400px" }}
          >
            <div className="modal-header modal-header-centered">
              <h2>Sign Out</h2>
            </div>
            <div
              className="modal-body"
              style={{ textAlign: "center", padding: "20px 0" }}
            >
              <p>Are you sure you want to sign out from your session?</p>
            </div>
            <div
              className="modal-footer"
              style={{ display: "flex", gap: "12px", marginTop: "24px" }}
            >
              <button
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setIsSignoutModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                style={{ flex: 1 }}
                onClick={async () => {
                  try {
                    const email = session?.user?.email;
                    if (vibeClient && email) {
                      await vibeClient.unregisterDevice(email);
                    }
                  } catch (pushErr) {
                    console.error(
                      "Failed to unregister push notifications:",
                      pushErr,
                    );
                  }
                  signOut();
                }}
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
