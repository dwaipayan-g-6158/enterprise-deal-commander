import { type CatalystApp, createDealSnapshotsRepo } from "@workspace/db/catalyst";
import { dealEvents, type DealEventType } from "../events";
import {
  serializeDeal,
  getDealGates,
  assembleDealIntelligence,
} from "../catalyst/intelligence";
import { getPlaybookSignals } from "../catalyst/playbook-signals";
import { getLatestMeddpiccScore } from "../catalyst/meddpicc";
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
    deal.isPerpetualTerm ? "1" : "0",
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

/**
 * Capture one snapshot. Serves BOTH callers: the event-driven subscriber below
 * and the periodic cron job (`snapshotAllActiveDealsCatalyst`).
 *
 * There used to be a second, Drizzle-backed `captureSnapshot` beside this one,
 * because the periodic job ran off an in-process timer with no request to
 * derive a `catalystApp` from. Catalyst Job Scheduling dissolved that: a job
 * run arrives as an ordinary HTTP request (see routes/jobs.ts), so the periodic
 * path now has an app like any other and the two implementations collapsed into
 * this one.
 *
 * `skipIfUnchanged` is set by the periodic caller only — event-driven captures
 * always write, because an event firing means something happened and the row is
 * the record of that moment.
 */
export async function captureSnapshotCatalyst(
  catalystApp: CatalystApp,
  opts: CaptureSnapshotOptions,
): Promise<boolean> {
  const { dealId, reason, triggerEvent, actor, force, skipIfUnchanged } = opts;
  const now = Date.now();
  if (!force) {
    const last = lastSnapshotAt.get(dealId);
    if (last !== undefined && now - last < DEBOUNCE_MS) return false;
  }
  lastSnapshotAt.set(dealId, now);

  const deal = await serializeDeal(catalystApp, dealId);
  if (!deal) {
    lastSnapshotAt.delete(dealId);
    return false;
  }
  const gates = await getDealGates(catalystApp, dealId);
  const intel = await assembleDealIntelligence(catalystApp, dealId);
  const playbook = await getPlaybookSignals(catalystApp, dealId);
  const meddpicc = await getLatestMeddpiccScore(catalystApp, dealId);

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

  const snapshotsRepo = createDealSnapshotsRepo(catalystApp);

  // Load-bearing: the hourly job would otherwise write one row per active deal
  // per hour whether or not anything moved, bloating the table and drowning the
  // event-driven restore points in the History UI (a real deal reached ~91
  // periodic rows against 29 real ones, and the newest page was 100% periodic).
  // Fingerprinting both sides through the shared `snapshotFingerprint` keeps the
  // comparison symmetric — the stored row's numeric columns come back as numbers
  // while the freshly-computed side carries them as whatever the engine produced,
  // which is why the fingerprint stringifies everything rather than comparing
  // raw values.
  if (skipIfUnchanged) {
    const prev = await snapshotsRepo.latestAtOrBefore(dealId, new Date());
    if (
      prev &&
      snapshotFingerprint({
        healthStatus: prev.healthStatus,
        salesStageId: prev.salesStageId,
        calculatedTcv: prev.calculatedTcv,
        normalizedTcv: prev.normalizedTcv,
        payload: prev.payload,
      }) ===
        snapshotFingerprint({
          healthStatus: deal.healthStatus,
          salesStageId: deal.salesStageId,
          calculatedTcv: deal.calculatedTCV ?? 0,
          normalizedTcv: deal.normalizedTCV ?? 0,
          payload,
        })
    ) {
      return false;
    }
  }

  await snapshotsRepo.create({
    dealId,
    reason,
    triggerEvent: triggerEvent ?? null,
    healthStatus: deal.healthStatus,
    salesStageId: deal.salesStageId,
    salesStage: deal.salesStage,
    calculatedTcv: deal.calculatedTCV ?? 0,
    normalizedTcv: deal.normalizedTCV ?? 0,
    payload,
    createdBy: actor,
  });
  return true;
}

/**
 * Periodic job, Catalyst-backed: snapshot every active deal, writing only where
 * the deal's content actually changed since its last snapshot.
 *
 * Sequential, not concurrent, and deliberately so — each capture assembles full
 * intelligence for one deal, and fanning that out would multiply exactly the
 * Data Store load that the concurrency limiter already has to hold back (see
 * lib/db/src/catalyst/sdk.ts). AppSail's 30-second request ceiling is the real
 * bound: `budgetMs` stops the run cleanly and reports how far it got, so a
 * portfolio too large for one invocation degrades into partial progress plus a
 * visible `remaining` count rather than a timeout with nothing written.
 */
export async function snapshotAllActiveDealsCatalyst(
  catalystApp: CatalystApp,
  dealIds: string[],
  budgetMs = 20_000,
): Promise<{
  written: number;
  considered: number;
  remaining: number;
  failed: number;
  errors: Array<{ dealId: string; error: string }>;
}> {
  const startedAt = Date.now();
  let written = 0;
  let considered = 0;
  // Returned, not just logged. A run that reports `written: 0` is ambiguous —
  // it means either "nothing changed" (the healthy steady state) or "every
  // write threw" — and on AppSail the log console lags several minutes and is
  // awkward to page through, so the distinction is expensive to recover after
  // the fact. The cron's own execution history now carries the reason.
  const errors: Array<{ dealId: string; error: string }> = [];
  for (const dealId of dealIds) {
    if (Date.now() - startedAt > budgetMs) break;
    considered++;
    try {
      const ok = await captureSnapshotCatalyst(catalystApp, {
        dealId,
        reason: "periodic",
        triggerEvent: null,
        actor: "system",
        force: true,
        skipIfUnchanged: true,
      });
      if (ok) written++;
    } catch (err) {
      // One bad deal must not abort the run for the rest of the portfolio.
      logger.error({ err, dealId }, "Periodic snapshot failed for deal");
      errors.push({
        dealId,
        // A Data Store / Stratus rejection is a PLAIN OBJECT, not an Error —
        // `String(err)` on one yields "[object Object]" and loses everything.
        error:
          err instanceof Error
            ? err.message
            : (JSON.stringify(err) ?? String(err)).slice(0, 400),
      });
    }
  }
  return {
    written,
    considered,
    remaining: dealIds.length - considered,
    failed: errors.length,
    errors: errors.slice(0, 5),
  };
}

/** Events that never warrant a new snapshot: the deal was removed, or shelved
 *  — a closed deal's state is frozen, so archiving it teaches us nothing new. */
export function shouldSkipSnapshot(eventType: DealEventType): boolean {
  return eventType === "deal.deleted" || eventType === "deal.archived";
}

export function registerSnapshotService(): () => void {
  return dealEvents.on(async (event) => {
    if (shouldSkipSnapshot(event.type)) return;
    // Absent if this event came from an emitter that hasn't migrated off
    // Drizzle yet — no-op rather than throw, per the event bus's "never
    // break the request path" contract (see lib/events.ts).
    if (!event.catalystApp) return;
    await captureSnapshotCatalyst(event.catalystApp as CatalystApp, {
      dealId: event.dealId,
      reason: `event:${event.type}`,
      triggerEvent: event.type,
      actor: event.actor,
    });
  });
}
