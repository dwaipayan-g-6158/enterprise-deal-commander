// The settings-change audit helper, shared by every route that writes to
// `v2_settings_change_log`.
//
// It takes the REQUEST, not a built `catalystApp`, and derives an admin-scoped
// app itself. That is a deliberate constraint rather than a convenience:
// `v2_settings_change_log` is Select-only for the "App User" role (same posture
// as `commanders` — see docs/CATALYST_SCHEMA.md), so an authenticated user
// cannot forge or rewrite audit history by talking to Data Store's REST API
// directly. Only this server, through the admin-scoped SDK init, can append.
//
// Taking `req` is what makes that hold BY CONSTRUCTION. The previous signature
// accepted whatever app the caller happened to have, and four route files
// passed the user-scoped one — so the guarantee rested on every call site
// remembering it.
//
// Worth knowing if this signature is ever changed again: `CatalystApp` is
// `any`, so TypeScript will NOT flag a call site that passes an app where a
// request is expected. It compiles and then fails at runtime reading `.headers`
// off an SDK object. Verify a change here by grepping the call sites, never by
// trusting a clean typecheck.
import {
  initCatalystAdminApp,
  createSettingsChangeLogRepo,
  type CatalystRequestLike,
  type SettingsChangeInput,
} from "@workspace/db/catalyst";

export type { SettingsChangeInput };

export async function logSettingsChange(
  req: CatalystRequestLike,
  input: SettingsChangeInput,
): Promise<void> {
  await createSettingsChangeLogRepo(initCatalystAdminApp(req)).record(input);
}
