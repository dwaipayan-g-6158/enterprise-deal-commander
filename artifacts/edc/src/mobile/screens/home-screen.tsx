import { useEffect } from "react";
import { Link } from "wouter";
import {
  useGetIntelligenceSummary,
  useGetVitalSigns,
  useListPortfolioActivity,
  type CriticalAlert,
} from "@workspace/api-client-react";
import { compactCurrency, humanizeCode, relativeTime } from "@/lib/format";
import { activityTitle } from "@/lib/activity-title";
import { HEALTH_CLASS, HEALTH_SHORT_LABEL, type Health } from "@/lib/semantic-colors";
import { EdcLogoMark } from "@/components/edc-logo-mark";
import { alertBody } from "@/mobile/lib/alert-text";
import { syncBadge } from "@/mobile/lib/app-badge";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { ListRow } from "@/mobile/components/list-row";
import { StatTile, DeltaLine } from "@/mobile/components/stat-tile";
import { CountUp } from "@/mobile/components/count-up";
import { Shimmer } from "@/mobile/components/shimmer";
import { ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { HealthDot } from "@/mobile/components/badges";

/**
 * Vital signs is an open payload in the contract; these are the fields the
 * desktop bar reads too (widgets/vital-signs-bar.tsx).
 */
interface VitalSigns {
  totalTCV: number;
  weightedPipeline: number;
  activeDeals: number;
  avgScore: number | null;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

const ACTIVITY_LIMIT = 6;
const ALERTS_SHOWN = 3;

/**
 * The brand mark in the nav bar. Static: the draw-in sequence belongs to the
 * launch moment (BootSplash), and replaying it every time someone taps Home
 * would turn a signature into a tic.
 */
const BRAND_MARK = <EdcLogoMark size={24} animated={false} />;

/**
 * The morning glance. Portfolio value first, then what is on fire, then what
 * moved — the order a commander actually asks for it.
 *
 * The dashboard's nine desktop rows do not survive the trip to a phone, so
 * this is a deliberate subset: the five vital signs, health, critical alerts
 * and recent activity. Everything deeper is one tap away in Deals.
 */
export function HomeScreen() {
  const summaryQuery = useGetIntelligenceSummary();
  const vitalsQuery = useGetVitalSigns();
  const activityQuery = useListPortfolioActivity({ limit: ACTIVITY_LIMIT });

  const summary = summaryQuery.data?.data;
  const vitals = vitalsQuery.data?.data as VitalSigns | undefined;
  const activity = activityQuery.data?.data ?? [];

  const refresh = () =>
    Promise.all([summaryQuery.refetch(), vitalsQuery.refetch(), activityQuery.refetch()]);

  // The home-screen icon badge, for anyone who opted in from the Commander
  // sheet. Rides on the summary this screen already loads rather than adding
  // a request of its own, and no-ops entirely when the opt-in is off.
  const redAlerts = summary?.criticalAlertsTotal;
  useEffect(() => {
    if (redAlerts != null) void syncBadge(redAlerts);
  }, [redAlerts]);

  if (summaryQuery.isError) {
    return (
      <>
        <MNavBar title="Command Center" leading={BRAND_MARK} />
        <ErrorState
          title="Couldn't load the portfolio"
          body="The pipeline summary didn't come back. Pull down to try again."
        />
      </>
    );
  }

  const currency = summary?.reportingCurrency ?? "USD";
  const money = (n: number) => compactCurrency(n, currency);
  const health = summary?.dealsByHealth;
  const totalDeals = health ? health.GREEN + health.YELLOW + health.RED : 0;
  const healthyPct = totalDeals > 0 ? Math.round((health!.GREEN / totalDeals) * 100) : 0;

  return (
    <>
      <MNavBar
        title="Command Center"
        leading={BRAND_MARK}
        subtitle={summary ? `${summary.totalDealsMonitored} deals monitored` : undefined}
      />

      <PullToRefresh onRefresh={refresh}>
        {/* Hero: the one number worth waking up to. */}
        <section className="px-4 pb-1 pt-4">
          <p className="m-label m-muted">Weighted pipeline</p>
          {vitals ? (
            <div className="m-appear">
              <p className="m-display mt-1">
                <CountUp value={vitals.weightedPipeline} format={money} once="home-pipeline" />
              </p>
              <p className="m-caption mt-1">
                <span className="m-muted">of {money(vitals.totalTCV)} total · </span>
                <DeltaLine
                  delta={vitals.baseline ? vitals.totalTCV - vitals.baseline.totalTCV : null}
                  format={money}
                />
              </p>
            </div>
          ) : (
            <>
              <Shimmer className="mt-1 h-10 w-48" />
              <Shimmer className="mt-2 h-3.5 w-40" />
            </>
          )}
        </section>

        <div className="space-y-3 p-4">
          {/* Health, alerts and score — the triage row. */}
          <div className="grid grid-cols-2 gap-3">
            <MobileCard className="col-span-2">
              <CardHeader label="Pipeline health" />
              {health ? (
                <>
                  <p className="m-title">
                    {healthyPct}% <span className="m-caption m-muted">healthy</span>
                  </p>
                  <p className="m-caption m-muted mt-1">
                    {money(summary!.tcvAtRiskRed)} at risk
                  </p>
                  <div className="mt-3 flex gap-3">
                    {(["GREEN", "YELLOW", "RED"] as Health[]).map((key) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <HealthDot health={key} />
                        <span className="m-caption">
                          {health[key]}
                          <span className="m-muted ml-1">{HEALTH_SHORT_LABEL[key]}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Proportional bar: the split, without a chart library. */}
                  <div className="mt-3 flex h-1.5 overflow-hidden rounded-full">
                    {(["GREEN", "YELLOW", "RED"] as Health[]).map((key) =>
                      health[key] > 0 ? (
                        <div
                          key={key}
                          className={HEALTH_CLASS[key].fill}
                          style={{ width: `${(health[key] / totalDeals) * 100}%` }}
                        />
                      ) : null,
                    )}
                  </div>
                </>
              ) : (
                <Shimmer className="h-24" />
              )}
            </MobileCard>

            {/* Not a link. `/deals?filter=critical` is the obvious
                destination and it is the wrong one: this counts alerts, that
                filter matches deals whose health is RED, and the two diverge
                — 1 and 0 on the seed data, landing the reader on "Nothing in
                this filter". The Critical alerts card below names the alert
                instead. */}
            <StatTile
              label="Red alerts"
              value={summary ? summary.criticalAlertsTotal : "—"}
              tone={summary && summary.criticalAlertsTotal > 0 ? "critical" : "default"}
              footnote={
                vitals?.baseline ? (
                  <DeltaLine
                    delta={summary ? summary.criticalAlertsTotal - vitals.baseline.redAlerts : null}
                    format={(n) => String(n)}
                  />
                ) : undefined
              }
            />
            {/* Red alerts stays a plain figure. It is the one number on this
                screen that means act now, and animating it reads as decoration
                on top of an alarm. */}
            <StatTile
              label="Avg score"
              value={
                vitals?.avgScore != null ? (
                  <CountUp
                    value={vitals.avgScore}
                    format={(n) => String(Math.round(n))}
                    once="home-avg-score"
                  />
                ) : (
                  "—"
                )
              }
              footnote={<span className="m-muted">Close probability</span>}
            />
          </div>

          {/* What is on fire. */}
          <MobileCard>
            <CardHeader
              label={`Critical alerts${summary ? ` (${summary.criticalAlertsTotal})` : ""}`}
              action={
                <Link href="/deals" className="m-caption text-primary">
                  All deals
                </Link>
              }
            />
            {!summary ? (
              <Shimmer className="h-20" />
            ) : summary.criticalAlerts.length === 0 ? (
              <p className="m-body m-muted">
                Nothing critical right now. The next check is on its way.
              </p>
            ) : (
              <ul className="space-y-1">
                {summary.criticalAlerts.slice(0, ALERTS_SHOWN).map((entry) => (
                  <AlertRow key={`${entry.dealId}-${entry.alert.code}`} entry={entry} money={money} />
                ))}
              </ul>
            )}
          </MobileCard>

          {/* Deals that have stopped moving. */}
          {summary && summary.staleDeals.length > 0 ? (
            <MobileCard>
              <CardHeader label={`Stalled (${summary.staleDealsTotal})`} />
              <ul>
                {summary.staleDeals.slice(0, 4).map((deal) => (
                  <li key={deal.dealId}>
                    <ListRow
                      href={`/deals/${deal.dealId}`}
                      title={deal.dealName}
                      trailing={`${deal.daysInStage}d in stage`}
                    />
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}

          {/* What moved. */}
          <MobileCard>
            <CardHeader label="Recent activity" />
            {activity.length === 0 ? (
              <Shimmer className="h-16" />
            ) : (
              <ul>
                {activity.map((event) => (
                  <li key={event.id}>
                    <ListRow
                      href={`/deals/${event.dealId}`}
                      title={activityTitle(event)}
                      sub={`${event.dealName ?? "Deal"} · ${event.actor}`}
                      trailing={relativeTime(event.occurredAt)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </MobileCard>
        </div>
      </PullToRefresh>
    </>
  );
}

function AlertRow({
  entry,
  money,
}: {
  entry: CriticalAlert;
  money: (n: number) => string;
}) {
  return (
    <li>
      <ListRow
        href={`/deals/${entry.dealId}`}
        title={entry.dealName}
        sub={
          <span className={HEALTH_CLASS.RED.text}>{humanizeCode(entry.alert.code)}</span>
        }
        // The engine's own message repeats the pattern name in block caps
        // right above, so the row would have said it twice. alertBody drops
        // the prefix when it is demonstrably the code.
        body={alertBody(entry.alert)}
        trailing={<span className="text-foreground">{money(entry.tcv)}</span>}
      />
    </li>
  );
}
