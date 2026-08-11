import { useMemo } from "react";
import { compactCurrency, calendarDaysUntil } from "@/lib/format";
import { computeStreak } from "@/lib/streak/compute-streak";
import { buildMission } from "@/lib/mission/priority-scorer";
import { terminalOutcome } from "@/components/roster/model/board";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MNavBrand } from "@/mobile/shell/m-nav-brand";
import { MAvatar } from "@/mobile/shell/m-avatar";
import { ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { useCommandData, toInsightVitals } from "@/mobile/screens/command/use-command-data";
import { buildGreetingContext, countRecentStageChanges } from "@/mobile/screens/command/greeting-context";
import { buildVerdict } from "@/mobile/screens/command/verdict";
import { buildNeedsYou } from "@/mobile/screens/command/needs-you";
import { VerdictBlock } from "@/mobile/screens/command/verdict-block";
import { NeedsBlock } from "@/mobile/screens/command/needs-block";
import { PulseBlock } from "@/mobile/screens/command/pulse-block";
import { MovementBlock } from "@/mobile/screens/command/movement-block";
import { ReadBlock } from "@/mobile/screens/command/read-block";
import { WeekBlock } from "@/mobile/screens/command/week-block";

/** "Closing this week" for the Monday plan — the same window the greeting uses. */
const CLOSE_WINDOW_DAYS = 7;

/**
 * The Command Center: six blocks, in the order a commander asks.
 *
 * ## What this replaced
 *
 * Fourteen dashboard widgets, five popover segments and eight drill-down
 * dialogs. Not by shrinking them — by answering the questions they collectively
 * answered, in the order they get asked: how is the portfolio (Verdict), what do
 * I do first (Needs), what is it worth (Pulse), what changed (Movement), what
 * should I know (Read), and what is this week (Week).
 *
 * The reorder control went with them. A customisation affordance on a six-block
 * screen is an admission that the order is wrong, and the right response to that
 * is to fix the order.
 *
 * ## Nothing here computes anything
 *
 * Every judgment — which greeting, which verdict, which three rows, which
 * insight — comes from a pure module with its own test. This file fetches,
 * arranges and hands off. That split is what made the verdict ladder and the
 * needs-you dedup testable at all, and it is why the blocks below are almost
 * entirely markup.
 */
export function CommandScreen() {
  const data = useCommandData();
  const money = useMemo(
    () => (n: number) => compactCurrency(n, data.reportingCurrency),
    [data.reportingCurrency],
  );

  const streak = useMemo(
    () => computeStreak(data.activity.map((e) => e.occurredAt), new Date()),
    [data.activity],
  );

  const greetingContext = useMemo(
    () =>
      buildGreetingContext(
        {
          deals: data.deals,
          recentStageChanges: countRecentStageChanges(data.activity, Date.now()),
          overdueActionCount: data.nextActions?.overdue?.length ?? 0,
          displayName: data.displayName,
        },
        money,
        Date.now(),
      ),
    [data.deals, data.activity, data.nextActions, data.displayName, money],
  );

  const verdict = useMemo(() => {
    if (!data.summary) return null;
    return buildVerdict(
      {
        redAlerts: data.summary.criticalAlertsTotal,
        tcvAtRisk: data.summary.tcvAtRiskRed,
        dealsByHealth: data.summary.dealsByHealth,
        staleDeals: data.summary.staleDealsTotal,
      },
      money,
    );
  }, [data.summary, money]);

  const needs = useMemo(
    () =>
      buildNeedsYou(
        data.summary?.criticalAlerts ?? [],
        buildMission(data.nextActions, data.valueByDealId, new Date()),
      ),
    [data.summary, data.nextActions, data.valueByDealId],
  );

  const closingThisWeek = useMemo(
    () =>
      data.deals.filter((d) => {
        if (terminalOutcome(d.salesStage) != null) return false;
        const days = calendarDaysUntil(d.expectedCloseDate);
        return days != null && days >= 0 && days <= CLOSE_WINDOW_DAYS;
      }).length,
    [data.deals],
  );

  if (data.isError) {
    return (
      <>
        <MNavBar title="Command" leading={<MNavBrand />} right={<MAvatar />} />
        <ErrorState
          title="Couldn't load the portfolio"
          body="The pipeline summary didn't come back. Pull down to try again."
        />
      </>
    );
  }

  return (
    <>
      <MNavBar
        title="Command"
        leading={<MNavBrand />}
        right={<MAvatar />}
        subtitle={
          data.summary ? `${data.summary.totalDealsMonitored} deals monitored` : undefined
        }
        // The subtitle waits on the summary, so without this the bar is one line
        // tall on the first paint and two once it lands — 20px that moves the whole
        // screen, because the bar is above everything. Measured here.
        reserveSubtitle
      />

      <PullToRefresh onRefresh={data.refresh}>
        <VerdictBlock
          greetingContext={greetingContext}
          // Gate on the summary having settled rather than on every query: the
          // greeting's hooks all degrade to "ineligible" when their counts are
          // zero, so a slow deals query costs a hook, not a wrong sentence.
          greetingReady={!data.isLoading}
          streak={streak}
          verdict={verdict}
          money={money}
        />

        <div className="space-y-3 px-4 pb-6 pt-2">
          <NeedsBlock rows={needs} loading={data.isLoading} />

          <PulseBlock
            vitals={data.vitals}
            health={data.summary?.dealsByHealth}
            tcvAtRisk={data.summary?.tcvAtRiskRed}
            staleDeals={data.summary?.staleDealsTotal}
            coverage={data.coverage}
            money={money}
          />

          <MovementBlock
            activity={data.activity}
            previousVisitAt={data.previousVisitAt}
            ready={data.visitReady}
          />

          <ReadBlock
            inputs={{
              vitalSigns: toInsightVitals(data.vitals, data.reportingCurrency),
              summary: data.summary ? { staleDeals: data.summary.staleDeals } : null,
              memoryInsights: data.memoryInsights ?? null,
            }}
          />

          <WeekBlock
            activity={data.activity}
            closingThisWeek={closingThisWeek}
            redAlerts={data.summary?.criticalAlertsTotal ?? 0}
            overdueActions={data.nextActions?.overdue?.length ?? 0}
          />
        </div>
      </PullToRefresh>
    </>
  );
}
