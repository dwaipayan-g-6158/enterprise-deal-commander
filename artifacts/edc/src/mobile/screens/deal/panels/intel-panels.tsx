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
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MetaChip } from "@/mobile/components/badges";
import { MChartFrame } from "@/mobile/charts/m-chart-frame";
import { MBars } from "@/mobile/charts/m-bars";
import { MSparkline } from "@/mobile/charts/m-sparkline";
import { HEALTH_PAINT, seriesPaint } from "@/mobile/charts/chart-colors";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";

/**
 * The predictive close score, and the factors moving it.
 *
 * `breakdown` is an open record in the contract, so each row is read
 * defensively — a factor the server adds later renders as an unlabelled
 * contribution rather than crashing a screen someone is reading in a lobby.
 */
export function ScorePanel({ dealId }: PanelBodyProps) {
  const query = useGetDealScore(dealId);
  const score = query.data?.data;

  const rows = useMemo(() => {
    const items = (score?.breakdown ?? []) as Record<string, unknown>[];
    return items
      .map((item) => {
        const rawLabel = item.factor ?? item.name ?? item.label;
        const rawValue = item.contribution ?? item.weightedScore ?? item.value;
        return {
          label: typeof rawLabel === "string" ? humanizeCode(rawLabel) : "Other",
          contribution: typeof rawValue === "number" ? rawValue : 0,
        };
      })
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  }, [score]);

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
            <p className="m-caption m-muted mt-1">
              {humanizeCode(score.confidence)} confidence
              {score.computedAt ? ` · ${formatDate(score.computedAt, "—")}` : ""}
            </p>
          </MobileCard>

          {rows.length > 0 ? (
            <MobileCard>
              <CardHeader label="What moves it" />
              <ul className="space-y-3">
                {/* Keyed by position, not label: two factors the server sends
                    without a string label both fall back to "Other". The order
                    is a deterministic sort of the same payload, so the index is
                    stable. */}
                {rows.map((row, i) => (
                  <li key={i}>
                    <div className="m-caption flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      <span className="m-muted m-num shrink-0">
                        {row.contribution > 0 ? "+" : ""}
                        {row.contribution.toFixed(1)}
                      </span>
                    </div>
                    {/* Magnitude relative to the strongest factor, not a share
                        of anything — direction is carried by the sign above and
                        by which side of the centre line the bar sits on. */}
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          row.contribution >= 0
                            ? HEALTH_CLASS.GREEN.fill
                            : HEALTH_CLASS.RED.fill,
                        )}
                        style={{
                          width: `${(Math.abs(row.contribution) / Math.max(...rows.map((r) => Math.abs(r.contribution)), 1)) * 100}%`,
                        }}
                      />
                    </div>
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

/** The loose analytics payload this panel reads. */
interface TrajectoryPoint {
  at: string;
  score: number | null;
  gatePct: number | null;
  health: string | null;
  stage: string | null;
  tcv: number | null;
}

interface StageChange {
  at: string;
  from: string | null;
  to: string | null;
}

/**
 * How the deal got here.
 *
 * ## Its own screen, not a strip under the hero
 *
 * It used to sit beneath the Brief's headline, scrubbing the value and health
 * above it while every section below went on showing today. A screen where half
 * the figures are historical and half are current is a screen you have to
 * remember the rules of. Here everything is history, and the rule is obvious.
 *
 * Score is the scrubbable series because it is the one the whole app is built to
 * predict; gates and value ride alongside as sparklines, which carry shape at a
 * size where axes would be noise.
 */
export function TrajectoryPanel({ dealId }: PanelBodyProps) {
  const query = useGetDealTrajectory(dealId);
  const payload = query.data?.data as
    | { points?: TrajectoryPoint[]; stageChanges?: StageChange[] }
    | undefined;

  const points = useMemo(() => payload?.points ?? [], [payload]);
  const scored = useMemo(() => points.filter((p) => p.score != null), [points]);
  const gated = useMemo(() => points.filter((p) => p.gatePct != null), [points]);
  const valued = useMemo(() => points.filter((p) => p.tcv != null), [points]);
  const stageChanges = payload?.stageChanges ?? [];

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && scored.length < 2}
      emptyTitle="Not enough history yet"
      emptyBody="A trajectory needs at least two snapshots. They accumulate as the deal changes."
    >
      <>
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

        {gated.length >= 2 ? (
          <MobileCard>
            <CardHeader label="Technical gates" />
            <MSparkline
              values={gated.map((p) => p.gatePct ?? 0)}
              label="Gate completion"
              format={(v) => `${Math.round(v)}%`}
              paint={seriesPaint(1)}
            />
          </MobileCard>
        ) : null}

        {valued.length >= 2 ? (
          <MobileCard>
            <CardHeader label="Contract value" />
            <MSparkline
              values={valued.map((p) => p.tcv ?? 0)}
              label="Total contract value"
              format={(v) => compactCurrency(v)}
              paint={seriesPaint(3)}
            />
          </MobileCard>
        ) : null}

        {stageChanges.length > 0 ? (
          <MobileCard>
            <CardHeader label="Stage moves" />
            <ul className="space-y-2">
              {[...stageChanges].reverse().map((change, i) => (
                <li key={i} className="m-caption flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">
                    {change.from ?? "—"} → <span className="text-foreground">{change.to ?? "—"}</span>
                  </span>
                  <span className="m-muted shrink-0">{formatDate(change.at, "—")}</span>
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
