// Repository for v2_settings_change_log (lib/db/src/schema/settings.ts). See
// docs/CATALYST_SCHEMA.md.

import {
  fetchAllRows,
  insertRow,
  toJson,
  fromJson,
  formatCatalystDateTime,
  parseCatalystDateTime,
  type CatalystApp,
  type RawRow,
} from "../sdk";

const TABLE = "v2_settings_change_log";

export interface SettingsChangeInput {
  module: string;
  settingKey: string;
  entityId?: string | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  dataType?: string | null;
  actor: string;
  reason?: string | null;
  rollbackOf?: string | null;
}

export interface SettingsChangeLogRow {
  id: string;
  module: string;
  settingKey: string;
  entityId: string | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  dataType: string | null;
  actor: string;
  reason: string | null;
  rollbackOf: string | null;
  changedAt: Date;
}

function rowToSettingsChangeLog(r: RawRow): SettingsChangeLogRow {
  return {
    id: r["id"],
    module: r["module"],
    settingKey: r["setting_key"],
    entityId: r["entity_id"] || null,
    action: r["action"],
    // Column is `text`, not `jsonb` — record() writes it via toJson(), so
    // reading it back with fromJson() is a plain symmetric round-trip. This
    // does NOT reproduce the drizzle-orm PgJsonb double-decode gotcha
    // documented in the route (that was specific to the Postgres jsonb
    // driver auto-decoding before drizzle re-parsed); here JSON.stringify's
    // output is the only thing ever JSON.parse'd back.
    oldValue: fromJson<unknown>(r["old_value"], null),
    newValue: fromJson<unknown>(r["new_value"], null),
    dataType: r["data_type_"] || null,
    actor: r["actor"],
    reason: r["reason"] || null,
    rollbackOf: r["rollback_of"] || null,
    changedAt: parseCatalystDateTime(r["changed_at"]),
  };
}

export function createSettingsChangeLogRepo(catalystApp: CatalystApp) {
  return {
    async record(input: SettingsChangeInput): Promise<void> {
      await insertRow(catalystApp, TABLE, {
        id: crypto.randomUUID(),
        module: input.module,
        setting_key: input.settingKey,
        entity_id: input.entityId ?? undefined,
        action: input.action,
        old_value: input.oldValue !== undefined ? toJson(input.oldValue) : undefined,
        new_value: input.newValue !== undefined ? toJson(input.newValue) : undefined,
        data_type_: input.dataType ?? undefined,
        actor: input.actor,
        reason: input.reason ?? undefined,
        rollback_of: input.rollbackOf ?? undefined,
        changed_at: formatCatalystDateTime(new Date()),
      });
    },
    /** Every change-log row, newest first — callers filter/limit in JS (no ZCQL). */
    async listAll(): Promise<SettingsChangeLogRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      return rows
        .map(rowToSettingsChangeLog)
        .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
    },
    async getById(id: string): Promise<SettingsChangeLogRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToSettingsChangeLog(row) : null;
    },
  };
}
