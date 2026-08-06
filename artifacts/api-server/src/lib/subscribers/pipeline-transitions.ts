import {
  type CatalystApp,
  createPipelineStagesRepo,
  createPipelineTransitionsRepo,
  createEnterpriseDealsRepo,
  createPricingModelsRepo,
  createDealSnapshotsRepo,
} from "@workspace/db/catalyst";
import { computeTransitionType, type StageDef } from "@workspace/engine";
import { dealEvents } from "../events";
import { logger } from "../logger";
import { termAwareTcv } from "../deal-filters";

async function loadStages(catalystApp: CatalystApp): Promise<StageDef[]> {
  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  return stages.map((s) => ({
    id: s.id,
    name: s.stageName,
    sortOrder: s.sortOrder,
    terminal: s.stageName === "Closed-Won" ? "won" as const : s.stageName === "Closed-Lost" ? "lost" as const : undefined,
  }));
}

export async function recordTransition(
  catalystApp: CatalystApp,
  args: {
    dealId: string;
    fromStageId: number | null;
    toStageId: number;
    overridden: boolean;
    actor: string;
    at?: Date;
  },
): Promise<void> {
  const stages = await loadStages(catalystApp);
  const fromStage = args.fromStageId != null ? stages.find((s) => s.id === args.fromStageId) : null;
  const toStage = stages.find((s) => s.id === args.toStageId);
  if (!toStage) return;

  const type = computeTransitionType(fromStage?.sortOrder ?? null, toStage);
  const at = args.at ?? new Date();

  // Residence in the stage being left = now − last transition INTO that stage.
  // For the deal's first-ever stage change (no prior transition row), fall back
  // to stageEnteredAt (when the deal entered its current stage).
  let daysInFromStage: number | null = null;
  if (args.fromStageId != null) {
    const dealTransitions = (await createPipelineTransitionsRepo(catalystApp).listAll()).filter(
      (t) => t.dealId === args.dealId,
    );
    const prev = dealTransitions[dealTransitions.length - 1]; // listAll() is sorted ascending by transitionedAt
    if (prev) {
      daysInFromStage = Math.max(0, Math.round((at.getTime() - prev.transitionedAt.getTime()) / 86_400_000));
    } else {
      // First stage change: no prior transition row — use deal's stageEnteredAt.
      const dealRow = await createEnterpriseDealsRepo(catalystApp).getById(args.dealId);
      if (dealRow) {
        daysInFromStage = Math.max(0, Math.round((at.getTime() - dealRow.stageEnteredAt.getTime()) / 86_400_000));
      }
    }
  }

  // Populate tcvAtTransition from the most recent deal snapshot at or before
  // the transition time (deal_snapshots stores the computed normalizedTcv).
  const snap = await createDealSnapshotsRepo(catalystApp).latestAtOrBefore(args.dealId, at);
  // A deal can transition before any snapshot exists for it — snapshots are
  // periodic, not written synchronously with every deal change. Falling back
  // to `null` there silently zeroed out the pipeline's "Created" value in the
  // Recycle & Exit waterfall. The deal's own current revenue fields are
  // always available, so fall back to those via termAwareTcv (the same
  // formula every other analytics route on this branch uses, post-H1
  // consolidation) instead of leaving tcvAtTransition unset. In practice this
  // path is now mostly a safety net — the deal's actual "create" transition
  // is recorded separately by recordCreateTransition below, on deal.created.
  let tcvAtTransition = snap?.normalizedTcv ?? null;
  if (tcvAtTransition == null) {
    const [dealRow, pricingModels] = await Promise.all([
      createEnterpriseDealsRepo(catalystApp).getById(args.dealId),
      createPricingModelsRepo(catalystApp).listAll(),
    ]);
    if (dealRow) {
      const pricingModel = pricingModels.find((p) => p.id === dealRow.pricingModelId)?.modelName ?? null;
      tcvAtTransition = termAwareTcv({
        productRevenue: dealRow.productRevenue,
        servicesRevenue: dealRow.servicesRevenue,
        contractTermYears: dealRow.contractTermYears,
        pricingModel,
      });
    }
  }

  await createPipelineTransitionsRepo(catalystApp).create({
    dealId: args.dealId,
    fromStageId: args.fromStageId,
    toStageId: args.toStageId,
    transitionType: type,
    tcvAtTransition,
    daysInFromStage,
    overridden: args.overridden,
    transitionedAt: at,
    createdBy: args.actor,
  });
}

/**
 * Records the initial "create" transition for a brand-new deal (fromStageId
 * null -> its starting stage). Without this, `pipeline_transitions` only ever
 * gains a "create" row via the one-shot backfill script — every deal created
 * since then has no create row, understating value-bridge (waterfall) totals.
 *
 * TCV is computed live from the deal's current economics (rather than looked
 * up from `deal_snapshots`, which may not exist yet for a brand-new deal).
 */
export async function recordCreateTransition(
  catalystApp: CatalystApp,
  args: {
    dealId: string;
    actor: string;
    at?: Date;
  },
): Promise<void> {
  const [deal, pricingModels] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).getById(args.dealId),
    createPricingModelsRepo(catalystApp).listAll(),
  ]);
  if (!deal) return;
  const pricingModel = pricingModels.find((p) => p.id === deal.pricingModelId)?.modelName ?? null;

  const tcv = termAwareTcv({
    productRevenue: deal.productRevenue,
    servicesRevenue: deal.servicesRevenue,
    contractTermYears: deal.contractTermYears,
    pricingModel,
  });

  await createPipelineTransitionsRepo(catalystApp).create({
    dealId: args.dealId,
    fromStageId: null,
    toStageId: deal.salesStageId,
    transitionType: "create",
    tcvAtTransition: Math.round(tcv),
    daysInFromStage: null,
    overridden: false,
    transitionedAt: args.at ?? new Date(),
    createdBy: args.actor,
  });
}

export function registerPipelineTransitions(): () => void {
  return dealEvents.on(async (event) => {
    // Absent if this event came from an emitter that hasn't migrated off
    // Drizzle yet — no-op rather than throw, per the event bus's "never
    // break the request path" contract (see lib/events.ts).
    if (!event.catalystApp) return;
    const catalystApp = event.catalystApp as CatalystApp;
    try {
      if (event.type === "deal.created") {
        await recordCreateTransition(catalystApp, {
          dealId: event.dealId,
          actor: event.actor,
          at: event.occurredAt,
        });
        return;
      }
      if (event.type === "deal.stage_changed") {
        await recordTransition(catalystApp, {
          dealId: event.dealId,
          fromStageId: event.fromStageId,
          toStageId: event.toStageId,
          overridden: event.overridden,
          actor: event.actor,
          at: event.occurredAt,
        });
      }
    } catch (err) {
      logger.error({ err, event: event.type }, "pipeline-transitions subscriber failed");
    }
  });
}
