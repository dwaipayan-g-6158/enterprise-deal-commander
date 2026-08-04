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
import { cn } from "@/lib/utils";
import { MobileHeader } from "@/mobile/shell/mobile-header";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { StatTile, DeltaLine } from "@/mobile/components/stat-tile";
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

  if (summaryQuery.isError) {
    return (
      <>
        <MobileHeader title="Command Center" />
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
      <MobileHeader
        title="Command Center"
        subtitle={summary ? `${summary.totalDealsMonitored} deals monitored` : undefined}
      />

      <PullToRefresh onRefresh={refresh}>
        {/* Hero: the one number worth waking up to. */}
        <section className="px-4 pb-1 pt-4">
          <p className="m-eyebrow">Weighted pipeline</p>
          {vitals ? (
            <>
              <p className="m-kpi-hero mt-1">{money(vitals.weightedPipeline)}</p>
              <p className="m-data mt-1">
                <span className="m-muted">of {money(vitals.totalTCV)} total · </span>
                <DeltaLine
                  delta={vitals.baseline ? vitals.totalTCV - vitals.baseline.totalTCV : null}
                  format={money}
                />
              </p>
            </>
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
                  <p className="m-h2">
                    {healthyPct}% <span className="m-muted text-base font-medium">healthy</span>
                  </p>
                  <p className="m-data m-muted mt-1">
                    {money(summary!.tcvAtRiskRed)} at risk
                  </p>
                  <div className="mt-3 flex gap-3">
                    {(["GREEN", "YELLOW", "RED"] as Health[]).map((key) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <HealthDot health={key} />
                        <span className="m-data">
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
            <StatTile
              label="Avg score"
              value={vitals?.avgScore != null ? Math.round(vitals.avgScore) : "—"}
              footnote={<span className="m-muted">Close probability</span>}
            />
          </div>

          {/* What is on fire. */}
          <MobileCard>
            <CardHeader
              label={`Critical alerts${summary ? ` (${summary.criticalAlertsTotal})` : ""}`}
              action={
                <Link href="/deals" className="m-data text-[var(--m-primary)]">
                  All deals
                </Link>
              }
            />
            {!summary ? (
              <Shimmer className="h-20" />
            ) : summary.criticalAlerts.length === 0 ? (
              <p className="m-body m-muted text-sm">
                Nothing critical right now. The next check is on its way.
              </p>
            ) : (
              <ul className="space-y-3">
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
              <ul className="space-y-2">
                {summary.staleDeals.slice(0, 4).map((deal) => (
                  <li key={deal.dealId}>
                    <Link
                      href={`/deals/${deal.dealId}`}
                      className="m-press flex items-baseline justify-between gap-3 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{deal.dealName}</span>
                      <span className="m-data m-muted shrink-0">{deal.daysInStage}d in stage</span>
                    </Link>
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
              <ul className="space-y-2.5">
                {activity.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/deals/${event.dealId}`}
                      className="m-press block py-0.5"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {activityTitle(event)}
                        </span>
                        <span className="m-data m-muted shrink-0">
                          {relativeTime(event.occurredAt)}
                        </span>
                      </div>
                      <p className="m-data m-muted mt-0.5 truncate">
                        {event.dealName ?? "Deal"} · {event.actor}
                      </p>
                    </Link>
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
      <Link href={`/deals/${entry.dealId}`} className="m-press block">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.dealName}</span>
          <span className="m-data shrink-0">{money(entry.tcv)}</span>
        </div>
        <p className={cn("m-data mt-0.5", HEALTH_CLASS.RED.text)}>
          {humanizeCode(entry.alert.code)}
        </p>
        <p className="m-body m-muted mt-0.5 line-clamp-2 text-sm">{entry.alert.message}</p>
      </Link>
    </li>
  );
}
