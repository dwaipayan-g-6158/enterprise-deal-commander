import { db, dealAuditLog } from "@workspace/db";

export interface AuditEntry {
  dealId: string;
  entityType: string;
  entityId?: string | null;
  fieldChanged: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy: string;
}

export async function writeAudit(entries: AuditEntry | AuditEntry[]) {
  const rows = Array.isArray(entries) ? entries : [entries];
  if (rows.length === 0) return;
  await db.insert(dealAuditLog).values(
    rows.map((r) => ({
      dealId: r.dealId,
      entityType: r.entityType,
      entityId: r.entityId ?? null,
      fieldChanged: r.fieldChanged,
      oldValue: r.oldValue ?? null,
      newValue: r.newValue ?? null,
      changedBy: r.changedBy,
    })),
  );
}
