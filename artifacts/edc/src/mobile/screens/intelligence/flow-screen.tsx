import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { compactCurrency, humanizeCode } from "@/lib/format";
import { useListPipelineStages } from "@workspace/api-client-react";
import type { MatrixCell, RecycleExit, WaterfallStep } from "@workspace/engine";
import {
  useFlowConversionMatrix,
  useFlowHealthScore,
  useFlowRecycle,
} from "@/components/cockpit/flow/use-flow";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";
import { useJumpTargets } from "@/mobile/commander/use-jump-targets";
import type { JumpTarget } from "@/mobile/commander/commander-context";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { Shimmer } from "@/mobile/components/shimmer";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";

interface HealthScoreData {
  score: number;
  subScores: Record<string, number | null>;
}

/** Transitions below this share are noise on a phone. */
const MIN_TRANSITION_SHARE = 0.02;
const TRANSITIONS_SHOWN = 8;

/**
 * How the pipeline flows: health, the strongest stage-to-stage moves, and the
 * value that leaks back out.
 *
 * ## The matrix became a ranked list, and the Sankey is not here
 *
 * A conversion matrix is stages × stages — six by six on this pipeline — and at
 * 358px each cell is four pixels of tinted background with a number nobody can
 * read. The information it carries is "which transitions actually happen and how
 * often", and a list sorted by exactly that answers it in one column with room
 * for the stage names spelled out.
 *
 * The Sankey is the same argument one step further. It is a two-dimensional flow
 * diagram whose whole value is the crossings, and the crossings are what
 * disappear first when you narrow it. It stays on desktop rather than shipping
 * here as decoration.
 */
export function FlowScreen() {
  const healthQuery = useFlowHealthScore();
  const matrixQuery = useFlowConversionMatrix();
  const recycleQuery = useFlowRecycle();
  const stagesQuery = useListPipelineStages();

  const health = healthQuery.data?.data as HealthScoreData | undefined;
  const recycle = recycleQuery.data?.data as RecycleExit | undefined;

  const stageName = useMemo(() => {
    const map = new Map((stagesQuery.data?.data ?? []).map((s) => [s.id, s.stageName]));
    return (id: number) => map.get(id) ?? `Stage ${id}`;
  }, [stagesQuery.data]);

  /**
   * The matrix, flattened and ranked by volume.
   *
   * Ranked by `n` rather than by `rate`: a 100% conversion off a single deal is
   * a rate, not a pattern, and putting it above a transition that fifty deals
   * made would be the list lying about what the pipeline does.
   *
   * Same-stage cells stay — the engine labels them "stagnation" and a stage
   * where deals sit is exactly what this screen is for.
   */
  const transitions = useMemo(() => {
    const grid = (matrixQuery.data?.data as MatrixCell[][] | undefined) ?? [];
    return grid
      .flat()
      .filter((cell) => cell.n > 0 && cell.rate / 100 >= MIN_TRANSITION_SHARE)
      .sort((a, b) => b.n - a.n)
      .slice(0, TRANSITIONS_SHOWN);
  }, [matrixQuery.data]);

  const refresh = () =>
    Promise.all([healthQuery.refetch(), matrixQuery.refetch(), recycleQuery.refetch()]);

  // The first two cards always render (they carry their own loading and empty
  // states); the third is conditional on the recycle query landing.
  const jumpTargets = useMemo<JumpTarget[]>(() => {
    const targets: JumpTarget[] = [
      {
        anchorId: "flow-health",
        label: "Pipeline health",
        detail: health ? `${Math.round(health.score)}/100` : undefined,
      },
      {
        anchorId: "flow-transitions",
        label: "Where deals actually move",
        detail: transitions.length > 0 ? String(transitions.length) : undefined,
      },
    ];
    if (recycle) targets.push({ anchorId: "flow-recycle", label: "Value in and out" });
    return targets;
  }, [health, transitions, recycle]);

  useJumpTargets(jumpTargets);

  return (
    <>
      <MNavBar title="Flow" backHref="/analytics" backLabel="Back to Intelligence" />

      <PullToRefresh onRefresh={refresh}>
        <div className="space-y-3 p-4">
          <MobileCard id="flow-health">
            <CardHeader label="Pipeline health" />
            {!health ? (
              <Shimmer className="h-24" />
            ) : (
              <>
                <p className="m-hero m-num">
                  {Math.round(health.score)}
                  <span className="m-caption m-muted ml-1.5">/ 100</span>
                </p>
                <ul className="mt-3 space-y-2">
                  {Object.entries(health.subScores).map(([key, value]) => (
                    <li key={key}>
                      <div className="m-caption flex items-baseline justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate">{humanizeCode(key)}</span>
                        <span className="m-muted m-num shrink-0">
                          {value != null ? Math.round(value) : "—"}
                        </span>
                      </div>
                      <div
                        className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </MobileCard>

          <MobileCard id="flow-transitions">
            <CardHeader label="Where deals actually move" />
            {matrixQuery.isLoading ? (
              <Shimmer className="h-32" />
            ) : transitions.length === 0 ? (
              <p className="m-body m-muted">
                No stage transitions recorded in the window yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {transitions.map((cell) => (
                  <li key={`${cell.fromId}-${cell.toId}`}>
                    <div className="m-caption flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">
                        {stageName(cell.fromId)}
                        <span className="m-muted"> → </span>
                        {stageName(cell.toId)}
                      </span>
                      <span className="m-muted m-num shrink-0">
                        {cell.n} · {Math.round(cell.rate)}%
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className={cn("h-full rounded-full", KIND_FILL[cell.kind] ?? "bg-primary")}
                        style={{ width: `${Math.max(0, Math.min(100, cell.rate))}%` }}
                      />
                    </div>
                    <p className="m-caption m-muted mt-0.5">{KIND_LABEL[cell.kind] ?? cell.kind}</p>
                  </li>
                ))}
              </ul>
            )}
          </MobileCard>

          {recycle ? <RecycleCard recycle={recycle} /> : null}
        </div>
      </PullToRefresh>
    </>
  );
}

/**
 * What a transition means, in the engine's own vocabulary.
 *
 * A loss reads slate rather than red — red stays reserved for live danger, never
 * for a decided outcome. That rule comes from `semantic-colors.ts` and holds on
 * both shells.
 */
const KIND_LABEL: Record<string, string> = {
  win: "Won",
  forward: "Advanced",
  stagnation: "Stayed put",
  regression: "Moved back",
  loss: "Lost",
};

const KIND_FILL: Record<string, string> = {
  win: OUTCOME_CLASS.won.fill,
  forward: "bg-primary",
  stagnation: "bg-muted-foreground",
  regression: "bg-destructive",
  loss: OUTCOME_CLASS.lost.fill,
};

/**
 * The waterfall: what entered the pipeline, what left, and what is still open.
 *
 * A negative "still open" residual is left signed and marked rather than clamped
 * to zero. `computeRecycleExit` deliberately does not clamp it, because a
 * negative there is a genuine reconciliation fault — usually a deal counted in
 * both exit buckets — and rendering it as an ordinary positive number would
 * throw away exactly the signal the unclamp exists to expose.
 */
function RecycleCard({ recycle }: { recycle: RecycleExit }) {
  return (
    <MobileCard id="flow-recycle">
      <CardHeader label="Value in and out" />
      <ul className="space-y-2">
        {recycle.waterfall.map((step: WaterfallStep, i) => {
          const ending = step.kind === "ending";
          const anomalous = ending && step.delta < 0;
          return (
            <li
              key={i}
              className={cn(
                "flex items-baseline justify-between gap-3",
                ending && "mt-1 border-t border-border pt-2",
              )}
            >
              <span className={cn(ending ? "m-headline" : "m-body", "min-w-0 flex-1 truncate")}>
                {step.label}
              </span>
              <span
                className={cn(
                  "m-num shrink-0",
                  ending ? "m-headline" : "m-body m-muted",
                  anomalous && "text-destructive",
                )}
              >
                {ending
                  ? `${anomalous ? "-" : ""}${compactCurrency(Math.abs(step.delta))}`
                  : `${step.delta < 0 ? "−" : "+"}${compactCurrency(Math.abs(step.delta))}`}
              </span>
            </li>
          );
        })}
      </ul>
      {recycle.waterfall.some((s) => s.kind === "ending" && s.delta < 0) ? (
        <p className="m-caption mt-2 text-pretty text-destructive">
          A negative still-open figure is impossible from clean data — closed value exceeds
          everything ever created. Most often a deal counted in both exit buckets.
        </p>
      ) : null}
    </MobileCard>
  );
}
