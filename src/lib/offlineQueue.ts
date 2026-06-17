/**
 * offlineQueue.ts
 *
 * Manages a persistent queue (localStorage) of API calls that failed
 * while the user was offline. When connectivity is restored the queue
 * is flushed in-order so the backend catches up.
 */

export interface OfflineQueueItem {
  id: string;
  url: string;
  method: string;
  body?: object;
  createdAt: number;
  retryCount: number;
}

const QUEUE_KEY = "wtt_offline_queue";

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineQueueItem[];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage might be full — fail silently
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Add a request to the queue. Timer-sync entries are deduplicated (keep latest). */
export function enqueue(
  url: string,
  method: string,
  body?: object,
): void {
  const queue = readQueue();

  // Dedup: for timer-sync POST, keep only the latest snapshot
  const isTimerSync = url.includes("/api/timer-sync") && method === "POST";
  const filtered = isTimerSync
    ? queue.filter((i) => !(i.url.includes("/api/timer-sync") && i.method === "POST"))
    : queue;

  filtered.push({ id: uuid(), url, method, body, createdAt: Date.now(), retryCount: 0 });
  writeQueue(filtered);
}

/** Return the current queue (oldest first). */
export function getQueue(): OfflineQueueItem[] {
  return readQueue().sort((a, b) => a.createdAt - b.createdAt);
}

/** Return the number of pending items. */
export function getPendingCount(): number {
  return readQueue().length;
}

/**
 * Replay all queued requests in chronological order.
 * Successful items are removed; failed ones stay (retry on next flush).
 * Returns the number of successfully synced items.
 */
export async function flush(
  onProgress?: (pending: number) => void,
): Promise<number> {
  const queue = getQueue(); // already sorted oldest-first
  if (queue.length === 0) return 0;

  let synced = 0;
  const remaining: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.body ? { "Content-Type": "application/json" } : undefined,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (res.ok || res.status === 404) {
        // 404 on punch-out means the row doesn't exist (edge case) — treat as done
        synced++;
      } else {
        remaining.push({ ...item, retryCount: item.retryCount + 1 });
      }
    } catch {
      // Still offline or server still down
      remaining.push({ ...item, retryCount: item.retryCount + 1 });
    }

    onProgress?.(remaining.length);
  }

  writeQueue(remaining);
  return synced;
}

/** Wipe the queue (called on Reset Day). */
export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}
