import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { AuthUser } from "@workspace/api-client-react";
import { defaultStore } from "@/lib/storage";

export type Role = "admin" | "reader";

/**
 * Roles permitted to write. "commander" is the value the server hardcoded
 * before the role enum existed (routes/auth.ts, pre-RBAC). Keeping it here
 * means a frontend deploy that lands ahead of the server deploy degrades to
 * "everything still works" instead of "the entire product silently went
 * read-only for everyone." Delete this entry once /auth/me is guaranteed to
 * return "admin" | "reader".
 */
const WRITE_ROLES = new Set(["admin", "commander"]);

export function normalizeRole(raw: string | null | undefined): Role {
  return raw != null && WRITE_ROLES.has(raw) ? "admin" : "reader";
}

// --- last-known-role persistence -------------------------------------------
// /auth/me is deliberately excluded from the service worker's read cache
// (vite.config.ts) because auth must hit the network, so when the app boots
// offline there is no way to recover the session role from Workbox either.
// We mirror it into localStorage on every successful session read and fall
// back to it while offline. That preserves an offline admin's write UI —
// which React Query's paused-mutation queue (offline-save-notice.tsx) exists
// to serve — and keeps an offline reader from queueing writes that would
// only 403 on reconnect.
//
// This value is UX only: it is trivially user-editable and every write is
// still refused by the server regardless. It MUST be cleared on sign-out —
// see useSignOut() — or the next person to sign in on this machine would
// briefly inherit the previous session's role before /auth/me resolves.
const ROLE_KEY = "edc.session.role";

function readPersistedRole(): Role | null {
  try {
    const raw = defaultStore.getItem(ROLE_KEY);
    return raw === "admin" || raw === "reader" ? raw : null;
  } catch {
    return null;
  }
}

function persistRole(role: Role): void {
  try {
    defaultStore.setItem(ROLE_KEY, role);
  } catch {
    // Quota exceeded / private mode: falls back to the reader default below.
  }
}

export function clearPersistedRole(): void {
  try {
    window.localStorage.removeItem(ROLE_KEY);
  } catch {
    // Advisory value; nothing to recover.
  }
}

// --- context -----------------------------------------------------------------

export interface SessionValue {
  /** undefined only while offline — /auth/me is neither reachable nor cached. */
  user: AuthUser | undefined;
  role: Role;
  /**
   * With exactly two roles, "is an admin" and "may write" are the same
   * predicate. Exposing one flag instead of two means no surface can gate on
   * the wrong one.
   */
  canWrite: boolean;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

/**
 * Mounted inside ProtectedRoute (App.tsx) and fed by the /auth/me result that
 * guard already fetches. Deliberately does NOT call useGetMe itself: that
 * would add a second request, and would fire /auth/me on the public /login
 * and /share/:token routes where there is no session to read.
 */
export function RoleProvider({
  user,
  children,
}: {
  user: AuthUser | undefined;
  children: ReactNode;
}) {
  const serverRole = user ? normalizeRole(user.role) : null;

  useEffect(() => {
    if (serverRole) persistRole(serverRole);
  }, [serverRole]);

  const value = useMemo<SessionValue>(() => {
    const role = serverRole ?? readPersistedRole() ?? "reader";
    return { user, role, canWrite: role === "admin" };
  }, [user, serverRole]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a RoleProvider");
  return ctx;
}

export function useCanWrite(): boolean {
  return useSession().canWrite;
}
