import { desc, eq } from "drizzle-orm";
import { db, dealSnapshots } from "@workspace/db";
import { dealEvents, type DealEventType } from "../events";
import {
  serializeDeal,
  getDealGates,
  assembleDealIntelligence,
} from "../intelligence";
import { getPlaybookSignals } from "../playbook-signals";
import { getLatestMeddpiccScore } from "../meddpicc";
import { logger } from "../logger";

/**
 * Captures point-in-time snapshots of a deal's serialized state, gate state,
 * and a compact governance summary into `edc_v2.deal_snapshots`.
 *
 * A short per-deal debounce dedupes the burst of events that co-fire from a
 * single user action (e.g. a stage change emits `deal.updated`,
 * `deal.stage_changed`, and `health.changed`). The periodic job bypasses the
 * debounce so long-idle deals still accrue history.
 */
const DEBOUNCE_MS = 3_000;
const lastSnapshotAt = new Map<string, number>();

export interface CaptureSnapshotOptions {
  dealId: string;
  reason: string;
  triggerEvent?: string | null;
  actor: string;
  force?: boolean;
  /**
   * Skip the insert when the deal's content is byte-identical to its most
   * recent snapshot. Set by the periodic job only — event-driven captures
   * always write, because an event firing means something happened and the
   * row is the record of that moment.
   */
  skipIfUnchanged?: boolean;
}

/** Numeric normalization: a numeric column round-trips as "3816400.00" but is
 *  computed as 3816400, and those must compare equal. */
function num(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

interface FingerprintInput {
  healthStatus?: string | null;
  salesStageId?: number | null;
  calculatedTcv?: unknown;
  normalizedTcv?: unknown;
  payload?: unknown;
}

/**
 * Stable fingerprint of everything a snapshot actually says about a deal.
 *
 * Deliberately excludes `snapshotAt`, `reason`, `triggerEvent`, `createdBy`
 * and the deal's own `createdAt`/`updatedAt`, so two captures taken an hour
 * apart with no intervening change produce the same string.
 *
 * It DOES include gate completion, the governance alert set, playbook and
 * MEDDPICC — so a change the summary columns can't see (a gate toggled, an
 * alert appearing while health stays YELLOW, a time-driven pattern firing as
 * the close date nears) still counts as a change and is captured. That
 * matters: matching health/stage/TCV alone does not mean the deal is
 * unchanged, which is why this compares content rather than those 4 columns.
 *
 * Both the row about to be written and the previously stored row are passed
 * through this same function, so the comparison is symmetric by construction.
 */
export function snapshotFingerprint(input: FingerprintInput): string {
  const p = (input.payload ?? {}) as Record<string, unknown>;
  const deal = (p.deal ?? {}) as Record<string, unknown>;
  const gov = (p.governance ?? {}) as Record<string, unknown>;
  const pb = p.playbook as Record<string, unknown> | undefined | null;
  const md = p.meddpicc as Record<string, unknown> | undefined | null;

  const gates = Array.isArray(p.gates)
    ? (p.gates as Record<string, unknown>[])
        .map((g) => `${String(g.gateCode)}:${g.isCompleted ? 1 : 0}`)
        .sort()
        .join(",")
    : "";

  const alerts = Array.isArray(gov.alerts)
    ? (gov.alerts as Record<string, unknown>[])
        .map((a) => `${String(a.code)}:${String(a.severity)}`)
        .sort()
        .join(",")
    : "";

  // Deal fields the snapshot viewer surfaces. Any change here also emits
  // deal.updated (so an event capture already covers it) — they're included
  // so the periodic path errs toward capturing rather than dropping.
  const economics = [
    String(deal.dealName ?? ""),
    String(deal.accountName ?? ""),
    String(deal.salesStage ?? ""),
    String(deal.accountManager ?? ""),
    String(deal.technicalLead ?? ""),
    String(deal.pricingModel ?? ""),
    String(deal.dealCurrency ?? ""),
    String(deal.expectedCloseDate ?? ""),
    num(deal.productRevenue),
    num(deal.servicesRevenue),
    num(deal.contractTermYears),
    num(deal.winProbabilityPct),
    deal.committed ? "1" : "0",
  ].join("|");

  return [
    String(input.healthStatus ?? ""),
    String(input.salesStageId ?? ""),
    num(input.calculatedTcv),
    num(input.normalizedTcv),
    economics,
    gates,
    alerts,
    pb ? [num(pb.adherencePct), num(pb.progressPct), num(pb.criticalGaps), num(pb.overdueCount)].join(",") : "",
    md ? [num(md.overallPct), num(md.stagePct), String(md.ragStatus ?? "")].join(",") : "",
  ].join("||");
}

export async function captureSnapshot(
  opts: CaptureSnapshotOptions,
): Promise<boolean> {
  const { dealId, reason, triggerEvent, actor, force, skipIfUnchanged } = opts;
  const now = Date.now();
  if (!force) {
    const last = lastSnapshotAt.get(dealId);
    if (last !== undefined && now - last < DEBOUNCE_MS) return false;
  }
  lastSnapshotAt.set(dealId, now);

  const deal = await serializeDeal(dealId);
  if (!deal) {
    lastSnapshotAt.delete(dealId);
    return false;
  }
  const gates = await getDealGates(dealId);
  const intel = await assembleDealIntelligence(dealId);
  const playbook = await getPlaybookSignals(dealId);
  const meddpicc = await getLatestMeddpiccScore(dealId);

  const governance = intel
    ? {
        healthStatus: intel.governance.healthStatus,
        alerts: intel.governance.alerts.map((a) => ({
          code: a.code,
          severity: a.severity,
        })),
      }
    : { healthStatus: deal.healthStatus, alerts: [] as unknown[] };

  const payload = {
    deal,
    gates,
    governance,
    playbook: {
      adherencePct: playbook.adherencePct,
      progressPct: playbook.progressPct,
      criticalGaps: playbook.criticalGaps,
      overdueCount: playbook.overdueCount,
    },
    meddpicc: meddpicc
      ? { overallPct: meddpicc.overallPct, stagePct: meddpicc.stagePct, ragStatus: meddpicc.ragStatus }
      : null,
  };

  const row = {
    dealId,
    reason,
    triggerEvent: triggerEvent ?? null,
    healthStatus: deal.healthStatus,
    salesStageId: deal.salesStageId,
    salesStage: deal.salesStage,
    calculatedTcv: String(deal.calculatedTCV ?? 0),
    normalizedTcv: String(deal.normalizedTCV ?? 0),
    payload,
    createdBy: actor,
  };

  // The hourly job would otherwise write one row per active deal per hour
  // whether or not anything moved, which both bloats the table and drowns the
  // event-driven restore points in the History UI (a real deal reached ~91
  // periodic rows against 29 real ones, and the newest page was 100% periodic).
  if (skipIfUnchanged) {
    const prev = await db
      .select({
        healthStatus: dealSnapshots.healthStatus,
        salesStageId: dealSnapshots.salesStageId,
        calculatedTcv: dealSnapshots.calculatedTcv,
        normalizedTcv: dealSnapshots.normalizedTcv,
        payload: dealSnapshots.payload,
      })
      .from(dealSnapshots)
      .where(eq(dealSnapshots.dealId, dealId))
      .orderBy(desc(dealSnapshots.snapshotAt))
      .limit(1);

    if (prev.length > 0 && snapshotFingerprint(prev[0]) === snapshotFingerprint(row)) {
      return false;
    }
  }

  await db.insert(dealSnapshots).values(row);
  return true;
}

/** Events that never warrant a new snapshot: the deal was removed, or shelved
 *  — a closed deal's state is frozen, so archiving it teaches us nothing new. */
export function shouldSkipSnapshot(eventType: DealEventType): boolean {
  return eventType === "deal.deleted" || eventType === "deal.archived";
}

export function registerSnapshotService(): () => void {
  return dealEvents.on(async (event) => {
    if (shouldSkipSnapshot(event.type)) return;
    await captureSnapshot({
      dealId: event.dealId,
      reason: `event:${event.type}`,
      triggerEvent: event.type,
      actor: event.actor,
    });
  });
}

/**
 * Periodic job: snapshot every active deal regardless of recent activity, but
 * only where the deal's content actually changed since its last snapshot.
 *
 * `force` bypasses the per-deal debounce so a long-idle deal is still
 * considered; `skipIfUnchanged` then decides whether there is anything new
 * worth recording. The returned count is captures actually written, so the
 * caller's log line reports the real number rather than the deal count.
 */
export async function snapshotAllActiveDeals(dealIds: string[]): Promise<number> {
  let count = 0;
  for (const dealId of dealIds) {
    try {
      const ok = await captureSnapshot({
        dealId,
        reason: "periodic",
        triggerEvent: null,
        actor: "system",
        force: true,
        skipIfUnchanged: true,
      });
      if (ok) count++;
    } catch (err) {
      logger.error({ err, dealId }, "Periodic snapshot failed for deal");
    }
  }
  return count;
}
