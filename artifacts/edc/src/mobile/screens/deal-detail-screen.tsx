import {
  useGetDealIntelligence,
  useGetDealScore,
  useGetMeddpiccAssessment,
  useGetPlaybookJourney,
  useGetDealTrajectory,
  useListDealActivity,
  type ActivityEvent,
} from "@workspace/api-client-react";
import { MobileHeader } from "@/mobile/shell/mobile-header";
import { Shimmer } from "@/mobile/components/shimmer";
import { ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { HeroSection } from "@/mobile/deal-detail/hero-section";
import { RiskSection } from "@/mobile/deal-detail/risk-section";
import { ScoreSection } from "@/mobile/deal-detail/score-section";
import { MeddpiccSection } from "@/mobile/deal-detail/meddpicc-section";
import { PlaybookSection, type JourneyEntry } from "@/mobile/deal-detail/playbook-section";
import { GatesSection } from "@/mobile/deal-detail/gates-section";
import { EconomicsSection } from "@/mobile/deal-detail/economics-section";
import { HistorySection } from "@/mobile/deal-detail/history-section";

/** Trajectory is an open payload in the contract; read only what's plotted. */
interface TrajectoryPoint {
  score: number | null;
}

const ACTIVITY_LIMIT = 20;

/**
 * One deal, top to bottom, in war-room priority order: what it's worth, what
 * could kill it, whether it will close, whether it's qualified, and how it
 * got here.
 *
 * Every section states its verdict at rest and opens for the evidence. Nothing
 * on this screen writes — the cockpit's dispositions, gate toggles and step
 * actions are all rendered as state.
 */
export function DealDetailScreen({ id }: { id: string }) {
  const intelQuery = useGetDealIntelligence(id);
  const scoreQuery = useGetDealScore(id);
  const meddpiccQuery = useGetMeddpiccAssessment(id);
  const journeyQuery = useGetPlaybookJourney(id);
  const trajectoryQuery = useGetDealTrajectory(id);
  const activityQuery = useListDealActivity(id, { limit: ACTIVITY_LIMIT });

  const intel = intelQuery.data?.data;

  const refresh = () =>
    Promise.all([
      intelQuery.refetch(),
      scoreQuery.refetch(),
      meddpiccQuery.refetch(),
      journeyQuery.refetch(),
      trajectoryQuery.refetch(),
      activityQuery.refetch(),
    ]);

  if (intelQuery.isError) {
    return (
      <>
        <MobileHeader title="Deal" backHref="/deals" backLabel="Back to deals" />
        <ErrorState
          title="Couldn't load this deal"
          body="It may have been archived, or the connection dropped. Go back and try again."
        />
      </>
    );
  }

  if (!intel) {
    return (
      <>
        <MobileHeader title="Deal" backHref="/deals" backLabel="Back to deals" />
        <div className="space-y-3 p-4">
          <Shimmer className="h-24 rounded-[var(--m-radius-card)]" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} className="h-20 rounded-[var(--m-radius-card)]" />
          ))}
        </div>
      </>
    );
  }

  const score = scoreQuery.data?.data;
  const meddpicc = meddpiccQuery.data?.data;
  const journey =
    (journeyQuery.data?.data as { journey?: JourneyEntry[] } | undefined)?.journey ?? [];
  const trajectory =
    (trajectoryQuery.data?.data as { points?: TrajectoryPoint[] } | undefined)?.points ?? [];
  const activity: ActivityEvent[] = activityQuery.data?.data ?? [];

  return (
    <>
      <MobileHeader
        title={intel.dealName}
        subtitle={intel.accountName}
        backHref="/deals"
        backLabel="Back to deals"
      />

      <PullToRefresh onRefresh={refresh}>
        <HeroSection intel={intel} scoreHistory={trajectory.map((p) => p.score)} />

        <div className="space-y-3 p-4">
          <RiskSection intel={intel} />
          {score ? <ScoreSection score={score} /> : null}
          {meddpicc ? <MeddpiccSection assessment={meddpicc} /> : null}
          <PlaybookSection journey={journey} />
          <GatesSection intel={intel} />
          <EconomicsSection intel={intel} />
          <HistorySection events={activity} />
        </div>
      </PullToRefresh>
    </>
  );
}
