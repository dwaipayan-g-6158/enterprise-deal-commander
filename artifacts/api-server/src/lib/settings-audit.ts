import { db, settingsChangeLog } from "@workspace/db";
import { computeRollback, type ChangeLogRowForRollback, type RollbackChange, type SettingsAction } from "./settings-rollback";

// Re-exported for backward compatibility — computeRollback and its types
// moved to the DB-free lib/settings-rollback.ts so routes/settings-audit.ts
// (migrated to Catalyst Data Store) can use them without importing this
// Drizzle-backed module. See settings-rollback.ts's header comment.
export { computeRollback };
export type { ChangeLogRowForRollback, RollbackChange, SettingsAction };

export interface SettingsChangeInput {
  module: string;
  settingKey: string;
  entityId?: string | null;
  action: SettingsAction;
  oldValue: unknown;
  newValue: unknown;
  dataType?: string | null;
  actor: string;
  reason?: string | null;
  rollbackOf?: string | null;
}

/**
 * Write one row to `settings_change_log`. Every settings mutation route in
 * the app calls this after its write succeeds — see Tasks 8-9. This is a
 * thin DB-touching wrapper with no branching logic, so it is verified via
 * the calling routes' manual smoke tests rather than a unit test (this
 * codebase does not unit-test `@workspace/db`-importing modules — see the
 * Global Constraints section of this plan).
 *
 * NOTE (Catalyst migration): still Drizzle/Postgres-backed. `routes/lookups.ts`
 * has been ported to Data Store and calls its own Catalyst-backed settings
 * audit repo directly (`createSettingsChangeLogRepo` from
 * `@workspace/db/catalyst`) rather than through this function, specifically
 * so that changing this shared helper's signature doesn't ripple into the
 * ~4 other files that still call it (settings-audit.ts route, users.ts,
 * v2/config.ts, v2/crud.ts) before their own Drizzle→Data Store migration
 * lands. Port this function itself once all of its callers are migrated
 * together — see docs/CATALYST_SCHEMA.md / the plan file for what's left.
 */
export async function logSettingsChange(input: SettingsChangeInput): Promise<void> {
  await db.insert(settingsChangeLog).values({
    module: input.module,
    settingKey: input.settingKey,
    entityId: input.entityId ?? null,
    action: input.action,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    dataType: input.dataType ?? null,
    actor: input.actor,
    reason: input.reason ?? null,
    rollbackOf: input.rollbackOf ?? null,
  });
}

