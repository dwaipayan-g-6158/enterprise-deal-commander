// Catalyst-backed reimplementation of ../audit.ts — see the module docstring
// in ./intelligence.ts for why this is a parallel file rather than an
// in-place rewrite. lib/subscribers/* and any not-yet-migrated route still
// import the original (Drizzle) `writeAudit` and are unaffected by this file.
import { type CatalystApp, createDealAuditLogRepo, type WriteAuditEntry } from "@workspace/db/catalyst";

export type AuditEntry = WriteAuditEntry;

/** Write one or more rows to `deal_audit_log` via Data Store. */
export async function writeAudit(catalystApp: CatalystApp, entries: AuditEntry | AuditEntry[]): Promise<void> {
  await createDealAuditLogRepo(catalystApp).write(entries);
}
