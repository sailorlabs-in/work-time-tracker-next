"use client";

import { useSession } from "next-auth/react";
import { getAppName } from "@/lib/brand";

export default function Footer() {
  const { data: session } = useSession();

  if (!session) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div className="app-footer-top">
          <div className="app-footer-about">
            <div className="app-footer-brand">
              <img src="/favicon.ico" alt="" className="app-footer-logo" />
              <span>{getAppName()}</span>
            </div>
            <p>
              A simple work-time tracker for recording sessions, breaks, daily
              notes, and monthly work history in one place.
            </p>
          </div>
          <div className="app-footer-instructions">
            <h2>How to use</h2>
            <ul>
              <li>Use Dashboard to punch in, take breaks, and punch out.</li>
              <li>Use Calendar to review days or add missing records.</li>
              <li>Use Settings to update work hours and preferences.</li>
            </ul>
          </div>
        </div>
        <div className="app-footer-copy">
          <span>&copy; {year}</span>
          <span>{getAppName()}. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
