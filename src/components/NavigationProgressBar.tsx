"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // When pathname or searchParams change, navigation has finished
  useEffect(() => {
    if (!loading) return;

    const completeTimer = setTimeout(() => {
      setProgress(100);
      const doneTimer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(doneTimer);
    }, 0);

    return () => clearTimeout(completeTimer);
  }, [pathname, searchParams, loading]);

  useEffect(() => {
    // Intercept clicks on internal links
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore external, anchor links, same-page or modifier clicks
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        target.getAttribute("target") === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if navigating to a different path
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl || href === window.location.pathname) {
        return;
      }

      // Start loader
      setLoading(true);
      setProgress(25);

      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      progressTimerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) {
            if (progressTimerRef.current) clearInterval(progressTimerRef.current);
            return prev;
          }
          return prev + Math.floor(Math.random() * 15 + 5);
        });
      }, 200);

      // Safety timeout after 10s
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setLoading(false);
        setProgress(0);
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      }, 10000);
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div className="nav-progress-bar-container">
      <div
        className={`nav-progress-bar-fill ${progress === 100 ? "done" : ""}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
