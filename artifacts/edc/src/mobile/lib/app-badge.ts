import { defaultStore, type KeyValueStore } from "@/lib/storage";

/**
 * The red-alert count on the home-screen icon.
 *
 * iOS 16.4 and later, installed home-screen apps only, and — unlike every
 * other platform — gated behind notification permission, because Apple routes
 * the badge through the same subsystem as notifications. That permission
 * prompt is a one-shot: decline it once and iOS will not ask again, which is
 * why this is opt-in from a row inside the app that says what it is for,
 * rather than something fired at launch.
 *
 * Read-only by construction. It publishes a number the Command Center has
 * already fetched; nothing here talks to the server.
 */

const KEY = "edc.mobile.appBadge";

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function badgeSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

export function badgeEnabled(store: KeyValueStore = defaultStore): boolean {
  try {
    return store.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function remember(on: boolean, store: KeyValueStore) {
  try {
    store.setItem(KEY, on ? "1" : "0");
  } catch {
    // Storage blocked. The badge still works for this session.
  }
}

export type BadgeOptIn = "enabled" | "denied" | "unsupported";

/**
 * Ask for permission and turn the badge on. Must be called straight from a
 * tap: iOS ignores a permission request that isn't attached to a gesture.
 */
export async function enableBadge(store: KeyValueStore = defaultStore): Promise<BadgeOptIn> {
  if (!badgeSupported() || typeof Notification === "undefined") return "unsupported";

  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return "denied";
    }
  }
  if (permission !== "granted") return "denied";

  remember(true, store);
  return "enabled";
}

export async function disableBadge(store: KeyValueStore = defaultStore): Promise<void> {
  remember(false, store);
  await clearBadge();
}

/** Publish `count`, or clear the badge when it is zero. No-op when opted out. */
export async function syncBadge(
  count: number,
  store: KeyValueStore = defaultStore,
): Promise<void> {
  if (!badgeEnabled(store)) return;
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // Permission revoked in Settings since opt-in, or the app is no longer
    // installed. Nothing to tell the user about mid-session.
  }
}

/** Clear it outright — on sign-out, whatever the stored preference says. */
export async function clearBadge(): Promise<void> {
  try {
    await (navigator as BadgeNavigator).clearAppBadge?.();
  } catch {
    // As above.
  }
}
