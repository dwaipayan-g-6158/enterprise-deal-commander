import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatDate, humanizeCode } from "@/lib/format";
import { useGetDealIntelligence, useListBlockers } from "@workspace/api-client-react";
import { HEALTH_CLASS, RISK_LEVEL_CLASS, RISK_LEVEL_LABEL } from "@/lib/semantic-colors";
import { sortDimensionsDesc } from "@/components/cockpit/risk/risk-model";
import { abbreviateDimension } from "@/components/cockpit/risk/risk-presentation";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MBars } from "@/mobile/charts/m-bars";
import { RISK_PAINT } from "@/mobile/charts/chart-colors";
import { MChartFrame } from "@/mobile/charts/m-chart-frame";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";

/**
 * The engine's full coaching list, plus what is driving the risk score.
 *
 * ## Sorted bars, not a radar
 *
 * A radar chart's enclosed area is an artefact of AXIS ORDER — reorder the axes
 * and the shape changes without a single value changing — so the "bigger blob is
 * worse" reading it invites is not true. `sortDimensionsDesc` already returns the
 * ordering that answers every question this panel supports: which dimension is
 * worst, and by how much. That is a bar chart, and it is scrubbable.
 */
export function CoachingPanel({ dealId }: PanelBodyProps) {
  const query = useGetDealIntelligence(dealId);
  const risk = query.data?.data?.risk;

  const dimensions = useMemo(
    () => (risk ? sortDimensionsDesc(risk.dimensions).filter((d) => d.assessable) : []),
    [risk],
  );

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && !risk}
      emptyTitle="No risk assessment yet"
      emptyBody="The engine scores a deal once it has enough signal to be worth scoring."
    >
      {risk ? (
        <>
          <MobileCard>
            <CardHeader label="Risk" />
            <p className={cn("m-title", RISK_LEVEL_CLASS[risk.riskLevel].text)}>
              {RISK_LEVEL_LABEL[risk.riskLevel]}
              <span className="m-caption m-muted m-num ml-2">{risk.compositeScore}</span>
            </p>
          </MobileCard>

          {risk.recommendedActions.length > 0 ? (
            <MobileCard>
              <CardHeader label={`Recommended (${risk.recommendedActions.length})`} />
              <ul className="space-y-3">
                {risk.recommendedActions.map((action, i) => (
                  <li key={`${action.source}-${action.patternCode ?? action.dimension ?? i}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="m-label m-muted">
                        {action.patternCode
                          ? humanizeCode(action.patternCode)
                          : action.dimension
                            ? abbreviateDimension(action.dimension)
                            : humanizeCode(action.source)}
                      </p>
                      <span className={cn("m-label shrink-0", priorityTone(action.priority))}>
                        {humanizeCode(action.priority)}
                      </span>
                    </div>
                    <p className="m-body mt-0.5 text-pretty">{action.action}</p>
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}

          {dimensions.length > 0 ? (
            <MChartFrame
              title="Where the risk is"
              subtitle="Higher is worse. Drag to inspect."
              data={dimensions.map((d) => ({
                label: abbreviateDimension(d.name),
                value: String(Math.round(d.score)),
                detail: `weight ${d.weight}`,
              }))}
            >
              <MBars
                data={dimensions.map((d) => ({
                  label: abbreviateDimension(d.name),
                  value: d.score,
                  // Each bar painted by what its own score means, so the chart
                  // uses the same vocabulary as the pill above it.
                  paint: RISK_PAINT[bandFor(d.score)],
                }))}
                format={(v) => String(Math.round(v))}
                label="Risk by dimension"
              />
            </MChartFrame>
          ) : null}

          {risk.topDrivers.length > 0 ? (
            <MobileCard>
              <CardHeader label="Top drivers" />
              <ul className="space-y-1.5">
                {risk.topDrivers.map((driver, i) => (
                  <li key={i} className="m-caption flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 text-pretty">
                      {humanizeCode(driver.factor)}
                      <span className="m-muted"> · {abbreviateDimension(driver.dimension)}</span>
                    </span>
                    <span className="m-muted m-num shrink-0">{Math.round(driver.impact)}</span>
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}
        </>
      ) : null}
    </PanelBody>
  );
}

/**
 * The colour of an action's priority.
 *
 * Deliberately NOT `priorityPresentation`'s className, which reaches for raw
 * Tailwind shades (`text-amber-500`, `text-orange-500`). Those are calibrated for
 * the desktop canvas and amber-500 measures 1.94:1 on white — the very reason
 * chart-colors.ts refuses to use the -500 scale for shapes. `semantic-colors.ts`
 * is the audited source, with measured AA floors, so the mobile shell reads its
 * tones from there.
 */
function priorityTone(priority: string): string {
  switch (priority) {
    case "BLOCKER":
    case "CRITICAL":
      return "text-destructive";
    case "HIGH":
      return HEALTH_CLASS.YELLOW.text;
    default:
      return "m-muted";
  }
}

/**
 * A dimension's own score, banded onto the same four levels the composite uses.
 *
 * The thresholds mirror `classifyRisk` in the engine rather than being invented
 * here, so a bar and the pill above it cannot disagree about what "elevated"
 * means.
 */
function bandFor(score: number): "LOW" | "MODERATE" | "ELEVATED" | "HIGH" {
  if (score >= 70) return "HIGH";
  if (score >= 50) return "ELEVATED";
  if (score >= 30) return "MODERATE";
  return "LOW";
}

/**
 * Blockers logged against the deal — the human-entered obstacles, as opposed to
 * the alerts the engine derives.
 *
 * Read-only. Logging one collects a category, a severity and prose, which is a
 * form; resolving one collects resolution notes, which is another. Both are
 * desktop work, and neither is something anyone does standing in a lobby.
 */
export function BlockersPanel({ dealId }: PanelBodyProps) {
  const query = useListBlockers(dealId);
  const blockers = query.data?.data ?? [];
  const open = blockers.filter((b) => !b.isResolved);
  const resolved = blockers.filter((b) => b.isResolved);

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && blockers.length === 0}
      emptyTitle="No blockers logged"
      emptyBody="Blockers are the obstacles somebody wrote down, alongside the ones the engine infers."
    >
      <>
        {open.length > 0 ? (
          <MobileCard>
            <CardHeader label={`Open (${open.length})`} />
            <ul className="space-y-3">
              {open.map((blocker) => (
                <li key={blocker.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="m-label m-muted">{blocker.category}</p>
                    <span className="m-label shrink-0 text-destructive">{blocker.severity}</span>
                  </div>
                  <p className="m-body mt-0.5 text-pretty">{blocker.description}</p>
                  {blocker.loggedAt ? (
                    <p className="m-caption m-muted mt-0.5">
                      Logged {formatDate(blocker.loggedAt, "—")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </MobileCard>
        ) : null}

        {resolved.length > 0 ? (
          <MobileCard>
            <CardHeader label={`Resolved (${resolved.length})`} />
            <ul className="space-y-3">
              {resolved.map((blocker) => (
                <li key={blocker.id} className="opacity-80">
                  <p className="m-label m-muted">
                    {blocker.category} · {blocker.severity}
                  </p>
                  <p className="m-body mt-0.5 text-pretty">{blocker.description}</p>
                  {blocker.resolutionNotes ? (
                    <p className="m-caption m-muted mt-0.5 text-pretty">
                      {blocker.resolutionNotes}
                    </p>
                  ) : null}
                  {blocker.resolvedAt ? (
                    <p className="m-caption m-muted mt-0.5">
                      Resolved {formatDate(blocker.resolvedAt, "—")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </MobileCard>
        ) : null}
      </>
    </PanelBody>
  );
}
