import { pgTable, uuid, varchar, timestamp, boolean } from "drizzle-orm/pg-core";

export const commanders = pgTable("commanders", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  /**
   * RBAC. 'admin' = full access; 'reader' = every read, zero writes.
   *
   * Defaults to 'reader' so anything created outside the users API is
   * fail-closed. The matching DB-side CHECK (role IN ('admin','reader')) lives
   * in lib/db/sql/2026-07-28-commander-rbac.sql — that file, not this one, is
   * what actually ran against Postgres, and it is not expressed here because
   * drizzle-kit push is not used for real schema changes in this repo.
   *
   * varchar + $type, not pgEnum: a pgEnum would need an ALTER TYPE to change,
   * and the role set is closed by product decision (exactly two roles).
   */
  role: varchar("role", { length: 20 })
    .$type<"admin" | "reader">()
    .notNull()
    .default("reader"),
  /**
   * Soft disable. requireAuth rejects an inactive commander on the very next
   * request — which is precisely why the session JWT carries no role or
   * active claim: a 7-day cookie cannot be allowed to outlive a revocation.
   */
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastDashboardVisitAt: timestamp("last_dashboard_visit_at", {
    withTimezone: true,
  }),
});
