// Pure, DB-free rollback computation for the settings change-log — split out
// of lib/settings-audit.ts so a Catalyst-migrated caller (routes/settings-audit.ts)
// can compute a rollback without importing anything that touches
// `@workspace/db` (that module is still Drizzle/Postgres-backed for its one
// remaining caller, routes/users.ts, blocked on Slice 4). lib/settings-audit.ts
// re-exports everything here for backward compatibility.

export type SettingsAction = "create" | "update" | "deactivate" | "reactivate" | "delete" | "rollback" | "import";

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
 * no DB. The caller is responsible for actually applying `valueToRestore` to
 * the right table via a per-module dispatch.
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
