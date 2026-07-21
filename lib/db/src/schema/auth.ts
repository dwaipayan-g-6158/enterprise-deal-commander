import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const commanders = pgTable("commanders", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastDashboardVisitAt: timestamp("last_dashboard_visit_at", {
    withTimezone: true,
  }),
});
