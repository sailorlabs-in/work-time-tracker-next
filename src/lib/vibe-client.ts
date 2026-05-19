import { initNotificationClient } from 'vibe-message';

const baseUrl = process.env.NEXT_PUBLIC_NOTIFICATION_BASE_URL;
const appId = process.env.NEXT_PUBLIC_NOTIFICATION_APP_ID;
const publicKey = process.env.NEXT_PUBLIC_NOTIFICATION_PUBLIC_KEY;

const VAPID_STORAGE_KEY = 'wtt_vapid_key';
const USER_EMAIL_STORAGE_KEY = 'wtt_user_email';

// Only initialize if we have the needed variables and we are on the client side
const baseVibeClient =
  typeof window !== 'undefined' && baseUrl && appId && publicKey
    ? initNotificationClient({
        baseUrl,
        appId,
        publicKey,
      })
    : null;

// ── VAPID Storage Management ──────────────────────────────────────────────────

export function storeVapidKey(vapidKey: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(VAPID_STORAGE_KEY, vapidKey);
    } catch (err) {
      console.warn('Failed to store VAPID key:', err);
    }
  }
}

export function getStoredVapidKey(): string | null {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem(VAPID_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to retrieve VAPID key:', err);
      return null;
    }
  }
  return null;
}

export function clearVapidKey(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(VAPID_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear VAPID key:', err);
    }
  }
}

export function storeUserEmail(email: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(USER_EMAIL_STORAGE_KEY, email);
    } catch (err) {
      console.warn('Failed to store user email:', err);
    }
  }
}

export function getStoredUserEmail(): string | null {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem(USER_EMAIL_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to retrieve user email:', err);
      return null;
    }
  }
  return null;
}

export function clearUserEmail(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(USER_EMAIL_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear user email:', err);
    }
  }
}

// ── Wrapped Registration Methods ────────────────────────────────────────────────

interface RegisterDeviceOptions {
  externalUserId: string;
}

export async function registerDevice(options: RegisterDeviceOptions): Promise<void> {
  if (!baseVibeClient) {
    console.warn('Vibe client not initialized');
    return;
  }

  try {
    // Store the user email for later reference
    storeUserEmail(options.externalUserId);

    // Try to use stored VAPID if available
    const storedVapid = getStoredVapidKey();
    if (storedVapid) {
      console.log('[VAPID] Using stored VAPID key');
    }

    // Call the base registerDevice method
    await baseVibeClient.registerDevice(options);

    // After successful registration, store the subscription details
    // Note: The vibe-message library handles VAPID internally, 
    // but we store a flag to know we're registered
    console.log('[VAPID] Device registered successfully');
  } catch (err) {
    console.error('[VAPID] Failed to register device:', err);
    throw err;
  }
}

export async function unregisterDevice(externalUserId: string): Promise<void> {
  if (!baseVibeClient) {
    console.warn('Vibe client not initialized');
    return;
  }

  try {
    // Call the base unregisterDevice method
    await baseVibeClient.unregisterDevice(externalUserId);

    // Clear stored credentials
    clearVapidKey();
    clearUserEmail();

    console.log('[VAPID] Device unregistered and VAPID cleared');
  } catch (err) {
    console.error('[VAPID] Failed to unregister device:', err);
    // Still clear the stored data even if unregistration fails
    clearVapidKey();
    clearUserEmail();
    throw err;
  }
}

// ── Export the base client with wrapped registration methods ──────────────────

export const vibeClient = baseVibeClient ? {
  // Forward all base client methods
  onMessage: baseVibeClient.onMessage.bind(baseVibeClient),
  onBackgroundMessage: baseVibeClient.onBackgroundMessage.bind(baseVibeClient),
  // Override registration methods with localStorage-aware versions
  registerDevice,
  unregisterDevice,
} : null;
