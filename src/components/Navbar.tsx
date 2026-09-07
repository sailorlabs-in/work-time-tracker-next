"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";
import {
  RiCloseLine,
  RiMenuLine,
  RiShieldStarLine,
  RiDashboardLine,
  RiCalendarLine,
  RiSettings4Line,
  RiLogoutBoxRLine,
} from "@remixicon/react";
import { vibeClient } from "@/lib/vibe-client";
import { getAppName } from "@/lib/brand";

function getUserInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.slice(0, 2).toUpperCase();
  }
  return "ME";
}

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

  const initials = getUserInitials(session.user?.name, session.user?.email);
  const displayName = session.user?.name || session.user?.email?.split("@")[0] || "My Account";

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
              <RiDashboardLine size={18} />
              <span>Dashboard</span>
            </Link>
            <Link
              href="/calendar"
              className={`nav-link ${pathname === "/calendar" ? "active" : ""}`}
              onClick={closeMenu}
            >
              <RiCalendarLine size={18} />
              <span>Calendar</span>
            </Link>
            {session.user?.isAdmin && (
              <Link
                href="/admin"
                className={`nav-link ${pathname.startsWith("/admin") ? "active" : ""}`}
                onClick={closeMenu}
              >
                <RiShieldStarLine size={18} />
                <span>Admin</span>
              </Link>
            )}
          </div>

          <div className="navbar-right">
            <ThemeToggle />
            <div className="navbar-user">
              <Link
                href="/settings"
                className={`nav-user-chip ${pathname === "/settings" ? "active" : ""}`}
                onClick={closeMenu}
                title="Account Settings"
              >
                <div className="user-avatar">
                  <span>{initials}</span>
                </div>
                <span className="user-name">{displayName}</span>
                <RiSettings4Line size={16} className="user-settings-icon" />
              </Link>
              <button
                onClick={openSignoutModal}
                className="btn-logout"
                title="Sign out of account"
              >
                <RiLogoutBoxRLine size={15} />
                <span className="logout-text">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isSignoutModalOpen && (
        <div
          className="modal-overlay confirmation-modal-overlay"
          onClick={() => setIsSignoutModalOpen(false)}
        >
          <div
            className="modal-card confirmation-modal-card animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header modal-header-centered confirmation-modal-header">
              <h2>Sign Out</h2>
            </div>
            <div className="modal-body confirmation-modal-body">
              <p>Are you sure you want to sign out from your session?</p>
            </div>
            <div className="modal-footer confirmation-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsSignoutModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-danger"
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
