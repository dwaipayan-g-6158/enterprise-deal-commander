// Catalyst Native Auth (Embedded) helper — resolves the current signed-in
// user from an incoming request, and the admin-scope user-directory
// operations backing the in-app Users page (list/invite/delete Catalyst
// project users). Modeled directly on the sibling Customer-Insight-Engine
// ("Periscope") project's lib/db/src/auth.ts, which has run this exact
// pattern in production for months. Field shapes match
// zcatalyst-sdk-node@3.4.0's `ICatalystUser`/`ICatalystSignupConfig`/
// `ICatalystSignupUserConfig` declarations, not the abbreviated skill docs.

import { initCatalystApp, initCatalystAdminApp, type CatalystRequestLike } from "./sdk";

export interface CatalystCurrentUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  // Catalyst's own project-level role (e.g. "App Administrator"/"App User") —
  // used ONLY to bootstrap the very first commanders row for a never-before-
  // seen Catalyst identity (see resolveCommander in artifacts/api-server's
  // lib/auth.ts). Never treated as the app-level admin/reader role after
  // that.
  isPlatformAdmin: boolean;
}

/**
 * Resolve the current Catalyst user from the request's session. Throws when
 * there's no valid session (or any other SDK failure) — callers distinguish
 * "not logged in" from unexpected errors and decide how to log/respond
 * instead of every failure mode silently collapsing to the same outcome.
 */
export async function getCurrentCatalystUser(req: CatalystRequestLike): Promise<CatalystCurrentUser> {
  const catalystApp = initCatalystApp(req);
  const user = await catalystApp.userManagement().getCurrentUser();
  return {
    userId: String(user.user_id),
    email: user.email_id,
    firstName: user.first_name ?? "",
    lastName: user.last_name ?? "",
    isPlatformAdmin: /admin/i.test(user.role_details?.role_name ?? ""),
  };
}

export interface CatalystDirectoryUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

function toDirectoryUser(u: {
  user_id: string | number;
  email_id: string;
  first_name: string;
  last_name: string;
}): CatalystDirectoryUser {
  return {
    userId: String(u.user_id),
    email: u.email_id,
    firstName: u.first_name ?? "",
    lastName: u.last_name ?? "",
  };
}

/**
 * Invite a new Catalyst project user (admin-scoped `registerUser`). Catalyst
 * sends its own set-password invite email; `redirectUrl` is where the user
 * lands after setting their password.
 */
export async function inviteCatalystUser(
  req: CatalystRequestLike,
  details: { firstName: string; lastName: string; email: string },
  redirectUrl: string,
): Promise<CatalystDirectoryUser> {
  const adminApp = initCatalystAdminApp(req);
  const created = await adminApp.userManagement().registerUser(
    { platform_type: "web", redirect_url: redirectUrl },
    { first_name: details.firstName, last_name: details.lastName, email_id: details.email },
  );
  return toDirectoryUser(created.user_details);
}

/**
 * Delete a Catalyst project user (admin-scoped). Best-effort from the
 * caller's perspective — see routes/users.ts's DELETE handler for how a
 * failure here is handled without blocking the app-level account removal.
 */
export async function deleteCatalystUser(req: CatalystRequestLike, userId: string): Promise<void> {
  const adminApp = initCatalystAdminApp(req);
  await adminApp.userManagement().deleteUser(userId);
}
