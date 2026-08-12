import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { compactCurrency, formatDate, humanizeCode } from "@/lib/format";
import {
  useGetDealIntelligence,
  useGetDealScore,
  useGetDealTrajectory,
  useListDealCompetitors,
  useListStakeholders,
} from "@workspace/api-client-react";
import { HEALTH_CLASS, OUTCOME_CLASS, type Health } from "@/lib/semantic-colors";
import {
  HEALTH_LABEL,
  deriveSummary,
  stageDurations,
  toChartRows,
  verdict,
  type Tone,
  type TrajectoryData,
} from "@/components/cockpit/trajectory/summary";
import { TONE_AHEAD, TONE_SLIPPING, TONE_STALLED } from "@/mobile/lib/tones";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MetaChip } from "@/mobile/components/badges";
import { MChartFrame } from "@/mobile/charts/m-chart-frame";
import { MBars } from "@/mobile/charts/m-bars";
import { MSparkline } from "@/mobile/charts/m-sparkline";
import { HEALTH_PAINT, seriesPaint } from "@/mobile/charts/chart-colors";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";

/**
 * The predictive close score, and how it was arrived at.
 *
 * ## Every factor used to be called "Other"
 *
 * `breakdown` was `additionalProperties: true` in the contract, so this panel
 * read it by guessing at field names — `item.factor ?? item.name ?? item.label`
 * — and the engine emits none of the three. The guard fell through for all nine
 * factors, every row rendered under the fallback label, and the neighbouring
 * comment rationalised it as an expected edge case for one unknown factor. The
 * numbers beside the labels were right the whole time, which is exactly why it
 * survived: the panel looked populated. The schema is typed now
 * (`DealScoreFactor`), so the field names are checked rather than guessed.
 *
 * ## Shortfall, not negative contribution
 *
 * `contribution` is `rawScore/100 × weight` with both terms non-negative, so it
 * can never be below zero and the old red/`-` branches here were unreachable. A
 * factor hurting the deal shows up as contribution far short of its weight, so
 * that gap — the headroom — is what this draws, rather than inventing a
 * direction the engine does not report.
 */
export function ScorePanel({ dealId }: PanelBodyProps) {
  const query = useGetDealScore(dealId);
  const score = query.data?.data;

  const rows = useMemo(() => {
    return [...(score?.breakdown ?? [])]
      .map((factor) => ({
        // `description` is the engine's own sentence for the factor
        // ("Technical validation progress"); featureId is the fallback only if
        // a future factor ships without one.
        label: factor.description || humanizeCode(factor.featureId),
        rawScore: factor.rawScore,
        weight: factor.weight,
        contribution: factor.contribution,
        /** Points this factor is leaving on the table. */
        headroom: Math.max(0, factor.weight - factor.contribution),
      }))
      .sort((a, b) => b.headroom - a.headroom || b.contribution - a.contribution);
  }, [score]);

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && !score}
      emptyTitle="Not scored yet"
      emptyBody="The predictive score needs a few signals on the deal before it means anything."
    >
      {score ? (
        <>
          <MobileCard>
            <CardHeader label="Close score" />
            <p className="m-hero m-num">
              {score.score}
              <span className="m-caption m-muted ml-1.5">/ 100</span>
            </p>
            {/* computedAt is deliberately not shown: routes/v2/analytics.ts
                stamps it with `new Date()` on every response, so it always
                reads as today and tells the reader nothing. */}
            <p className="m-caption m-muted mt-1">
              {humanizeCode(score.confidence)} confidence
            </p>
          </MobileCard>

          {rows.length > 0 ? (
            <MobileCard>
              <CardHeader label="Where the points went" />
              <p className="m-caption m-muted -mt-1 mb-3 text-pretty">
                Each factor earns a share of its weight. Ordered by what is still
                unearned.
              </p>
              <ul className="space-y-3">
                {rows.map((row) => (
                  <li key={row.label}>
                    <div className="m-caption flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      <span className="m-muted m-num shrink-0">
                        {row.contribution} / {row.weight}
                      </span>
                    </div>
                    {/* Earned against the factor's own weight, with every bar
                        drawn to a common scale (the total weight) so a 22-point
                        factor visibly outranks a 5-point one. Scaling each bar
                        to its own weight would draw both full and imply they
                        matter equally. */}
                    <div
                      className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className={cn("h-full", HEALTH_CLASS.GREEN.fill)}
                        style={{ width: `${(row.contribution / totalWeight) * 100}%` }}
                      />
                      <div
                        className={cn("h-full opacity-40", HEALTH_CLASS.RED.fill)}
                        style={{ width: `${(row.headroom / totalWeight) * 100}%` }}
                      />
                    </div>
                    <p className="m-caption m-muted mt-1">
                      Scoring {row.rawScore}% of this factor
                      {row.headroom > 0 ? ` · ${row.headroom} points unearned` : " · fully earned"}
                    </p>
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

const TONE_CLASS: Record<Tone, string> = {
  good: TONE_AHEAD,
  warn: TONE_SLIPPING,
  bad: TONE_STALLED,
};

/** The five series the endpoint carries, and how each one reads. */
const TRAJECTORY_SERIES = [
  {
    key: "gatePct" as const,
    label: "Technical gates",
    paintIndex: 1,
    format: (v: number) => `${Math.round(v)}%`,
  },
  {
    key: "playbookPct" as const,
    label: "Playbook adherence",
    paintIndex: 2,
    format: (v: number) => `${Math.round(v)}%`,
  },
  {
    key: "meddpiccPct" as const,
    label: "MEDDPICC qualification",
    paintIndex: 4,
    format: (v: number) => `${Math.round(v)}%`,
  },
  {
    key: "tcv" as const,
    label: "Contract value",
    paintIndex: 3,
    format: (v: number) => compactCurrency(v),
  },
];

/**
 * How the deal got here — the conclusion first, then the evidence.
 *
 * ## It used to make the reader do the arithmetic
 *
 * This screen drew three charts and a list of stage moves, and left "so is this
 * deal getting better or worse?" entirely to the reader. On a phone, held one-
 * handed, that is the one question being asked, and a bar chart answers it only
 * after you have found the first bar, found the last, and compared them. Desktop
 * had a deterministic verdict headline and first-vs-current deltas the whole
 * time; those are now shared rather than reimplemented, in
 * `components/cockpit/trajectory/summary.ts`.
 *
 * ## Two series were being thrown away
 *
 * The endpoint returns seven metrics per point. This panel's local point type
 * declared five, so `playbookPct` and `meddpiccPct` — playbook execution and
 * qualification, both first-class signals elsewhere in the app, and one of them
 * a scoring factor — were dropped on the floor with nothing to indicate it. The
 * shared `TrajectoryPoint` now types all seven.
 *
 * Score stays the scrubbable series because it is the thing the app exists to
 * predict; the rest ride as sparklines, which carry shape at a size where axes
 * would be noise.
 */
export function TrajectoryPanel({ dealId }: PanelBodyProps) {
  const query = useGetDealTrajectory(dealId);
  const payload = query.data?.data as Partial<TrajectoryData> | undefined;

  const points = useMemo(() => payload?.points ?? [], [payload]);
  const rows = useMemo(() => toChartRows(points), [points]);
  const summary = useMemo(() => (rows.length > 0 ? deriveSummary(rows) : null), [rows]);
  const call = useMemo(() => (summary ? verdict(summary) : null), [summary]);
  const stages = useMemo(() => stageDurations(rows), [rows]);
  const scored = useMemo(() => rows.filter((p) => p.score != null), [rows]);

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && scored.length < 2}
      emptyTitle="Not enough history yet"
      emptyBody="A trajectory needs at least two snapshots. They accumulate as the deal changes."
    >
      <>
        {summary && call ? (
          <MobileCard>
            <p className="m-headline text-pretty">
              <span className={TONE_CLASS[call.tone]}>{call.lead}</span>
              {call.rest}
            </p>
            <p className="m-caption m-muted mt-1">
              Across {summary.spanDays} {summary.spanDays === 1 ? "day" : "days"} of history
            </p>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
              <Movement
                label="Close score"
                first={summary.score.first}
                last={summary.score.last}
                format={(v) => String(Math.round(v))}
              />
              <Movement
                label="Gates"
                first={summary.gate.first}
                last={summary.gate.last}
                format={(v) => `${Math.round(v)}%`}
              />
              <Movement
                label="Contract value"
                first={summary.tcv.first}
                last={summary.tcv.last}
                format={(v) => compactCurrency(v)}
              />
              <div className="flex flex-col">
                <dt className="m-label m-muted">Health</dt>
                <dd className="m-title m-num mt-0.5">
                  {summary.health.last ? HEALTH_LABEL[summary.health.last] : "—"}
                </dd>
                <p className="m-caption m-muted mt-0.5">
                  {summary.healthTrend === "flat"
                    ? "Unchanged"
                    : summary.health.first
                      ? `${summary.healthTrend === "improved" ? "Up" : "Down"} from ${HEALTH_LABEL[summary.health.first]}`
                      : humanizeCode(summary.healthTrend)}
                </p>
              </div>
            </dl>
          </MobileCard>
        ) : null}

        <MChartFrame
          title="Close score over time"
          subtitle="Drag to inspect."
          data={scored.map((p) => ({
            label: formatDate(p.at, "—") ?? "—",
            value: String(p.score),
            detail: p.stage ?? undefined,
          }))}
        >
          <MBars
            data={scored.map((p) => ({
              label: formatDate(p.at, "—") ?? "—",
              value: p.score ?? 0,
              paint: healthPaintFor(p.health),
            }))}
            format={(v) => String(Math.round(v))}
            label="Close score over time"
          />
        </MChartFrame>

        {TRAJECTORY_SERIES.map((series) => {
          const values = rows
            .map((row) => row[series.key])
            .filter((v): v is number => v != null);
          // Two points is the floor for a line to mean anything; one point is a
          // reading, not a trend.
          if (values.length < 2) return null;
          return (
            <MobileCard key={series.key}>
              <CardHeader label={series.label} />
              <MSparkline
                values={values}
                label={series.label}
                format={series.format}
                paint={seriesPaint(series.paintIndex)}
              />
            </MobileCard>
          );
        })}

        {stages.length > 0 ? (
          <MobileCard>
            <CardHeader label="Time in each stage" />
            {/* Durations, not the raw stage-change log this replaced. "Moved to
                Commercial on 3 Aug" needs the reader to subtract dates to learn
                the thing that matters, which is that it has been sitting there
                for three weeks. */}
            <ul className="space-y-2.5">
              {stages.map((stage) => (
                <li key={`${stage.stage}-${stage.days}`}>
                  <div className="m-caption flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate">
                      {stage.stage}
                      {stage.isCurrent ? (
                        <span className="m-muted"> · current</span>
                      ) : null}
                    </span>
                    <span className="m-muted m-num shrink-0">{stage.days}d</span>
                  </div>
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        stage.health
                          ? HEALTH_CLASS[stage.health].fill
                          : "bg-muted-foreground/40",
                      )}
                      style={{
                        width: `${(stage.days / Math.max(...stages.map((s) => s.days), 1)) * 100}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="m-caption m-muted mt-2.5">
              Bar length is time spent; colour is the worst health seen in that stage.
            </p>
          </MobileCard>
        ) : null}
      </>
    </PanelBody>
  );
}

/**
 * One metric's baseline → current, with the change spelled out.
 *
 * The delta is the point of the cell, so it is stated in words rather than left
 * as two numbers side by side for the reader to subtract.
 */
function Movement({
  label,
  first,
  last,
  format,
}: {
  label: string;
  first: number | null;
  last: number | null;
  format: (value: number) => string;
}) {
  const delta = first != null && last != null ? last - first : null;
  const tone = delta == null || delta === 0 ? "" : delta > 0 ? TONE_AHEAD : TONE_STALLED;

  return (
    <div className="flex flex-col">
      <dt className="m-label m-muted">{label}</dt>
      <dd className="m-title m-num mt-0.5">{last != null ? format(last) : "—"}</dd>
      <p className={cn("m-caption mt-0.5", tone || "m-muted")}>
        {delta == null
          ? "No baseline yet"
          : delta === 0
            ? "Unchanged"
            : `${delta > 0 ? "+" : "−"}${format(Math.abs(delta))} from ${format(first as number)}`}
      </p>
    </div>
  );
}

/**
 * The health of a trajectory point, which the loose payload types as a bare
 * string. Only three values are real; anything else — including a null on a
 * snapshot taken before health was tracked — gets no tint rather than being
 * coerced into one, because a bar painted green because the value was
 * unrecognised is worse than a bar with no opinion.
 */
function healthPaintFor(health: string | null) {
  if (health === "GREEN" || health === "YELLOW" || health === "RED") {
    return HEALTH_PAINT[health as Health];
  }
  return undefined;
}

/**
 * Who else is in the deal, and what the engine has to say about them.
 *
 * Read-only: adding a competitor is a picker plus a status plus a displacement
 * strategy, which is a form.
 */
export function CompetitivePanel({ dealId }: PanelBodyProps) {
  const competitorsQuery = useListDealCompetitors(dealId);
  const intelQuery = useGetDealIntelligence(dealId);

  const competitors = competitorsQuery.data?.data ?? [];
  const battlecard = intelQuery.data?.data?.battlecard;

  return (
    <PanelBody
      loading={competitorsQuery.isLoading}
      error={competitorsQuery.isError}
      empty={!competitorsQuery.isLoading && competitors.length === 0 && !battlecard}
      emptyTitle="No competitors logged"
      emptyBody="A deal with no named competitor is either uncontested or under-qualified."
    >
      <>
        {competitors.length > 0 ? (
          <MobileCard>
            <CardHeader label={`Competitors (${competitors.length})`} />
            <ul className="space-y-3">
              {competitors.map((competitor) => (
                <li key={competitor.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="m-headline min-w-0 flex-1 truncate">
                      {competitor.competitorName ?? "Unnamed"}
                    </p>
                    <span className={cn("m-label shrink-0", statusTone(competitor.status))}>
                      {competitor.status}
                    </span>
                  </div>
                  {competitor.displacementStrategy ? (
                    <p className="m-body m-muted mt-0.5 text-pretty">
                      {competitor.displacementStrategy}
                    </p>
                  ) : null}
                  {competitor.outcomeNotes ? (
                    <p className="m-caption m-muted mt-0.5 text-pretty">{competitor.outcomeNotes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </MobileCard>
        ) : null}

        {battlecard ? (
          <MobileCard>
            <CardHeader label={`Against ${battlecard.competitor}`} />
            <ul className="space-y-2">
              {battlecard.talkingPoints.map((point, i) => (
                <li key={i} className="m-body flex gap-2 text-pretty">
                  <span aria-hidden="true" className="m-muted">
                    ·
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </MobileCard>
        ) : null}
      </>
    </PanelBody>
  );
}

/**
 * Competitive posture versus outcome.
 *
 * Beating a competitor is the same colour as winning the deal, and losing to one
 * is slate rather than red — red stays reserved for live danger. Active and
 * Displaced are posture, not outcomes, so they read neutral.
 */
function statusTone(status: string): string {
  if (status === "Won Against") return OUTCOME_CLASS.won.text;
  if (status === "Lost To") return OUTCOME_CLASS.lost.text;
  if (status === "Active") return HEALTH_CLASS.YELLOW.text;
  return "m-muted";
}

/** How strongly a stakeholder's sentiment reads. */
const SENTIMENT_TONE: Record<string, string> = {
  Champion: HEALTH_CLASS.GREEN.text,
  Supporter: HEALTH_CLASS.GREEN.text,
  Neutral: "m-muted",
  Skeptic: HEALTH_CLASS.YELLOW.text,
  Detractor: HEALTH_CLASS.RED.text,
  Hostile: HEALTH_CLASS.RED.text,
};

/**
 * The buying committee.
 *
 * Decision makers lead, then everyone else by influence — which is the order the
 * question "who do I need in the room" is actually asked in.
 */
export function StakeholdersPanel({ dealId }: PanelBodyProps) {
  const query = useListStakeholders(dealId);
  const stakeholders = query.data?.data ?? [];

  const sorted = useMemo(
    () =>
      [...stakeholders].sort((a, b) => {
        if (a.isDecisionMaker !== b.isDecisionMaker) return a.isDecisionMaker ? -1 : 1;
        return INFLUENCE_RANK(b.influenceLevel) - INFLUENCE_RANK(a.influenceLevel);
      }),
    [stakeholders],
  );

  const decisionMakers = sorted.filter((s) => s.isDecisionMaker).length;

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && stakeholders.length === 0}
      emptyTitle="No stakeholders mapped"
      emptyBody="An unmapped committee is one of the twelve patterns the engine watches for."
    >
      <>
        <MobileCard>
          <CardHeader label="Committee" />
          <p className="m-title m-num">
            {stakeholders.length}
            <span className="m-caption m-muted ml-2">
              {decisionMakers} decision {decisionMakers === 1 ? "maker" : "makers"}
            </span>
          </p>
        </MobileCard>

        <MobileCard>
          <CardHeader label="People" />
          <ul className="space-y-4">
            {sorted.map((person) => (
              <li key={person.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="m-headline min-w-0 flex-1 truncate">{person.name}</p>
                  <span
                    className={cn(
                      "m-label shrink-0",
                      SENTIMENT_TONE[person.sentiment] ?? "m-muted",
                    )}
                  >
                    {person.sentiment}
                  </span>
                </div>
                <p className="m-caption m-muted mt-0.5 truncate">
                  {[person.title, person.company].filter(Boolean).join(" · ") || "—"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <MetaChip>{person.roleType}</MetaChip>
                  <MetaChip>{person.influenceLevel} influence</MetaChip>
                  {person.isDecisionMaker ? <MetaChip>Decision maker</MetaChip> : null}
                </div>
                {person.notes ? (
                  <p className="m-caption m-muted mt-1.5 text-pretty">{person.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </MobileCard>
      </>
    </PanelBody>
  );
}

/** Influence is a free-text lookup on the server; only the order matters here. */
function INFLUENCE_RANK(level: string): number {
  switch (level) {
    case "High":
      return 3;
    case "Medium":
      return 2;
    case "Low":
      return 1;
    default:
      return 0;
  }
}
