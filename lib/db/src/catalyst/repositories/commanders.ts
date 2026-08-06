// Repository for `commanders` (lib/db/src/schema/auth.ts), ported onto
// Catalyst Data Store as part of Slice 4 (Catalyst embedded authentication).
//
// Identity keying changed from the Drizzle original: a commander row is now
// keyed by Catalyst's own `catalyst_user_id` (filled in on first login), not
// a locally-issued password. `catalyst_user_id` is nullable and deliberately
// NOT a unique Data Store column — `commanders` already carries 2 unique
// varchar columns (`id`, `username`), and Data Store enforces a hard cap of 2
// unique varchar columns per table (reproduced live creating this column).
// Uniqueness for `catalyst_user_id` is instead enforced the same way this
// migration already enforces every composite/secondary key: a lookup before
// insert, not a DB constraint.
//
// Every write here should go through an ADMIN-scoped `catalystApp` (see
// lib/db/src/catalyst/sdk.ts's `initCatalystAdminApp`) — this table is
// pulled back to Select-only for the "App User" role (see
// docs/CATALYST_SCHEMA.md's Slice 4 note) so an authenticated-but-unprivileged
// Catalyst user cannot self-promote by writing directly to the table via
// Catalyst's own Data Store REST API. The repo itself is scope-agnostic; the
// caller (artifacts/api-server/src/lib/auth.ts, routes/users.ts) decides
// which scope to pass.

import {
  fetchAllRows,
  insertRow,
  updateRow,
  deleteRow,
  parseBoolean,
  formatBoolean,
  parseCatalystDateTime,
  formatCatalystDateTime,
  type CatalystApp,
  type RawRow,
} from "../sdk";

const TABLE = "commanders";

// password_hash is a mandatory legacy column (created in Slice 2, before
// this table's identity model changed) — no longer read or exposed anywhere,
// but every insert must still supply a value. This sentinel makes that
// obvious to anyone who ever inspects the raw Data Store row.
const UNUSED_PASSWORD_SENTINEL = "catalyst-managed-no-local-password";

export type CommanderRole = "admin" | "reader";

export interface CommanderRow {
  id: string;
  catalystUserId: string | null;
  username: string;
  displayName: string;
  role: CommanderRole;
  isActive: boolean;
  createdAt: Date;
  lastDashboardVisitAt: Date | null;
}

function rowToCommander(r: RawRow): CommanderRow {
  return {
    id: r["id"],
    catalystUserId: r["catalyst_user_id"] || null,
    username: r["username"],
    displayName: r["display_name"],
    role: r["role"] === "admin" ? "admin" : "reader",
    isActive: parseBoolean(r["is_active"]),
    createdAt: parseCatalystDateTime(r["created_at"]),
    lastDashboardVisitAt: r["last_dashboard_visit_at"] ? parseCatalystDateTime(r["last_dashboard_visit_at"]) : null,
  };
}

export interface CreateCommanderInput {
  /** Null for an invited-but-not-yet-signed-in account — filled in by claim() on first login. */
  catalystUserId: string | null;
  username: string;
  displayName: string;
  role: CommanderRole;
  isActive?: boolean;
}

export function createCommandersRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<CommanderRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      return rows.map(rowToCommander).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    async getById(id: string): Promise<CommanderRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const row = rows.find((r) => r["id"] === id);
      return row ? rowToCommander(row) : null;
    },
    async getByCatalystUserId(catalystUserId: string): Promise<CommanderRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const row = rows.find((r) => r["catalyst_user_id"] === catalystUserId);
      return row ? rowToCommander(row) : null;
    },
    /** Case-insensitive, matching the original login/create's `lower(username) = lower(email)` comparison. */
    async getByUsername(username: string): Promise<CommanderRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const wanted = username.toLowerCase();
      const row = rows.find((r) => r["username"].toLowerCase() === wanted);
      return row ? rowToCommander(row) : null;
    },
    /** An outstanding invite for this email — a row with no catalyst_user_id yet. */
    async getPendingInviteByUsername(username: string): Promise<CommanderRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const wanted = username.toLowerCase();
      const row = rows.find((r) => r["username"].toLowerCase() === wanted && !r["catalyst_user_id"]);
      return row ? rowToCommander(row) : null;
    },
    async create(input: CreateCommanderInput): Promise<CommanderRow> {
      const created = await insertRow(catalystApp, TABLE, {
        id: crypto.randomUUID(),
        catalyst_user_id: input.catalystUserId ?? undefined,
        username: input.username,
        display_name: input.displayName,
        password_hash: UNUSED_PASSWORD_SENTINEL,
        role: input.role,
        is_active: formatBoolean(input.isActive ?? true),
        created_at: formatCatalystDateTime(new Date()),
      });
      return rowToCommander(created);
    },
    /** Fill in catalyst_user_id on a pending invite's first successful login — never reassignable after. */
    async claim(id: string, catalystUserId: string): Promise<CommanderRow> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) throw new Error(`claim(): no commander row with id ${id}`);
      const updated = await updateRow(catalystApp, TABLE, existing["ROWID"], {
        catalyst_user_id: catalystUserId,
      });
      return rowToCommander(updated);
    },
    async update(
      id: string,
      updates: { displayName?: string; role?: CommanderRole; isActive?: boolean },
    ): Promise<CommanderRow | null> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const values: Record<string, unknown> = {};
      if (updates.displayName !== undefined) values["display_name"] = updates.displayName;
      if (updates.role !== undefined) values["role"] = updates.role;
      if (updates.isActive !== undefined) values["is_active"] = formatBoolean(updates.isActive);
      const updated = await updateRow(catalystApp, TABLE, existing["ROWID"], values);
      return rowToCommander(updated);
    },
    async delete(id: string): Promise<void> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const existing = rows.find((r) => r["id"] === id);
      if (existing) await deleteRow(catalystApp, TABLE, existing["ROWID"]);
    },
    /**
     * Record a dashboard visit, returning the PREVIOUS visit timestamp (null
     * on a first-ever visit). Data Store has no CTE/`UPDATE ... RETURNING` —
     * read-then-write instead, a benign single-user race (the original
     * Drizzle version used a CTE for the same reason ZCQL has no equivalent;
     * see docs/catalyst-datastore-constraints.md).
     */
    async touchDashboardVisit(id: string): Promise<Date | null> {
      const rows = await fetchAllRows(catalystApp, TABLE);
      const existing = rows.find((r) => r["id"] === id);
      if (!existing) return null;
      const previous = existing["last_dashboard_visit_at"]
        ? parseCatalystDateTime(existing["last_dashboard_visit_at"])
        : null;
      await updateRow(catalystApp, TABLE, existing["ROWID"], {
        last_dashboard_visit_at: formatCatalystDateTime(new Date()),
      });
      return previous;
    },
  };
}
