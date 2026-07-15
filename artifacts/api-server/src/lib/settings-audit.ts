import { db, settingsChangeLog } from "@workspace/db";

export type SettingsAction = "create" | "update" | "deactivate" | "reactivate" | "delete" | "rollback" | "import";

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

export interface ChangeLogRowForRollback {
  module: string;
  settingKey: string;
  entityId: string | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface RollbackChange {
  module: string;
  settingKey: string;
  entityId: string | null;
  action: SettingsAction;
  valueToRestore: unknown;
}

/**
 * Given a change-log row, compute what a rollback of it must write — pure,
 * no DB. The caller (Task 11's rollback route) is responsible for actually
 * applying `valueToRestore` to the right table via a per-module dispatch.
 */
export function computeRollback(row: ChangeLogRowForRollback): RollbackChange {
  switch (row.action) {
    case "update":
      return {
        module: row.module,
        settingKey: row.settingKey,
        entityId: row.entityId,
        action: "update",
        valueToRestore: row.oldValue,
      };
    case "create":
      return {
        module: row.module,
        settingKey: row.settingKey,
        entityId: row.entityId,
        action: "deactivate",
        valueToRestore: null,
      };
    case "deactivate":
      return {
        module: row.module,
        settingKey: row.settingKey,
        entityId: row.entityId,
        action: "reactivate",
        valueToRestore: null,
      };
    case "delete":
      return {
        module: row.module,
        settingKey: row.settingKey,
        entityId: row.entityId,
        action: "create",
        valueToRestore: row.oldValue,
      };
    default:
      throw new Error(`Cannot compute rollback for action "${row.action}"`);
  }
}
