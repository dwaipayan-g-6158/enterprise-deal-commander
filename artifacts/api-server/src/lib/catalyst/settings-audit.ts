// Catalyst-backed settings-change audit helper, shared by every migrated
// route that writes to `v2_settings_change_log`. Calls the Catalyst-backed
// repo directly rather than through the shared lib/settings-audit.ts's
// `logSettingsChange` — that helper is still Drizzle/Postgres-backed for its
// other not-yet-migrated callers (routes/settings-audit.ts, users.ts,
// routes/v2/crud.ts). See the note in lib/settings-audit.ts and the
// equivalent local helper in routes/lookups.ts (this file exists so
// routes/v2/config.ts doesn't need its own duplicate).
import { type CatalystApp, createSettingsChangeLogRepo, type SettingsChangeInput } from "@workspace/db/catalyst";

export type { SettingsChangeInput };

export async function logSettingsChange(catalystApp: CatalystApp, input: SettingsChangeInput): Promise<void> {
  await createSettingsChangeLogRepo(catalystApp).record(input);
}
