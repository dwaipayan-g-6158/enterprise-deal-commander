import {
  useGetDealIntelligence,
  useGetDealScore,
  useGetMeddpiccAssessment,
  useGetPlaybookJourney,
  useGetDealTrajectory,
  useListDealActivity,
  type ActivityEvent,
} from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { useJumpTargets } from "@/mobile/commander/use-jump-targets";
import { sharedCardSeed } from "@/mobile/lib/shared-card";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { Shimmer } from "@/mobile/components/shimmer";
import { ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import type {
  TrajectoryPoint,
  TrajectoryStageChange,
} from "@/mobile/components/trajectory-scrubber";
import { HeroPreview, HeroSection } from "@/mobile/deal-detail/hero-section";
import { RiskSection } from "@/mobile/deal-detail/risk-section";
import { ScoreSection } from "@/mobile/deal-detail/score-section";
import { MeddpiccSection } from "@/mobile/deal-detail/meddpicc-section";
import { PlaybookSection, type JourneyEntry } from "@/mobile/deal-detail/playbook-section";
import { GatesSection } from "@/mobile/deal-detail/gates-section";
import { EconomicsSection } from "@/mobile/deal-detail/economics-section";
import { HistorySection } from "@/mobile/deal-detail/history-section";

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
  // What the roster card knew, if this screen was opened by tapping one.
  // Read once at mount: the morph is released as soon as the transition
  // settles, and the loading hero below outlives that.
  const [seed] = useState(() => sharedCardSeed(id));
  const intelQuery = useGetDealIntelligence(id);
  const scoreQuery = useGetDealScore(id);
  const meddpiccQuery = useGetMeddpiccAssessment(id);
  const journeyQuery = useGetPlaybookJourney(id);
  const trajectoryQuery = useGetDealTrajectory(id);
  const activityQuery = useListDealActivity(id, { limit: ACTIVITY_LIMIT });

  const intel = intelQuery.data?.data;
  const scoreData = scoreQuery.data?.data;
  const meddpiccData = meddpiccQuery.data?.data;

  // Published to the Commander capsule so it can offer section jumps. Built
  // before the early returns below, because hooks can't be conditional; it is
  // simply empty until the data arrives.
  const jumpTargets = useMemo(
    () =>
      intel
        ? [
            {
              anchorId: "risk",
              label: "Risk",
              detail: `${intel.governance.alerts.length} open`,
            },
            {
              anchorId: "score",
              label: "Predictive score",
              detail: scoreData ? String(scoreData.score) : undefined,
            },
            {
              anchorId: "meddpicc",
              label: "MEDDPICC",
              detail: meddpiccData ? `${Math.round(meddpiccData.score.overallPct)}%` : undefined,
            },
            { anchorId: "playbook", label: "Playbook" },
            {
              anchorId: "gates",
              label: "Technical gates",
              detail: `${Math.round(intel.technicalTrack.progressPercentage)}%`,
            },
            { anchorId: "economics", label: "Economics & team" },
            { anchorId: "history", label: "History" },
          ]
        : [],
    [intel, scoreData, meddpiccData],
  );
  useJumpTargets(jumpTargets);

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
        <MNavBar title="Deal" backHref="/deals" backLabel="Back to deals" />
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
        <MNavBar
          title={seed?.title ?? "Deal"}
          subtitle={seed?.eyebrow}
          backHref="/deals"
          backLabel="Back to deals"
          // Only when the seeded hero below is about to say the same thing.
          // Without a seed the shimmer says nothing, so the bar is the only
          // place the reader learns which deal they opened.
          collapseTitle={seed != null}
        />
        {seed ? (
          <HeroPreview dealId={id} seed={seed} />
        ) : (
          <Shimmer className="mx-4 mt-4 h-24 rounded-xl" />
        )}
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  const journey =
    (journeyQuery.data?.data as { journey?: JourneyEntry[] } | undefined)?.journey ?? [];
  // Trajectory is an open payload in the contract, and every metric on it
  // carries forward independently, so the scrubber reads each field
  // defensively rather than assuming a point has all of them.
  const trajectory = trajectoryQuery.data?.data as
    | { points?: TrajectoryPoint[]; stageChanges?: TrajectoryStageChange[] }
    | undefined;
  const activity: ActivityEvent[] = activityQuery.data?.data ?? [];

  return (
    <>
      <MNavBar
        title={intel.dealName}
        subtitle={intel.accountName}
        backHref="/deals"
        backLabel="Back to deals"
        // The hero repeats both of these verbatim 8px lower. The bar holds
        // them back until the hero has scrolled away and it becomes the only
        // thing left saying which deal this is.
        collapseTitle
      />

      <PullToRefresh onRefresh={refresh}>
        <HeroSection
          intel={intel}
          dealId={id}
          trajectory={trajectory?.points ?? []}
          stageChanges={trajectory?.stageChanges ?? []}
        />

        {/* Only the sections crossfade. The hero was already on screen from
            the preview above, and fading it in a second time reads as a
            flash. */}
        <div className="m-appear space-y-3 p-4">
          <RiskSection intel={intel} />
          {scoreData ? <ScoreSection score={scoreData} /> : null}
          {meddpiccData ? <MeddpiccSection assessment={meddpiccData} /> : null}
          <PlaybookSection journey={journey} />
          <GatesSection intel={intel} />
          <EconomicsSection intel={intel} />
          <HistorySection events={activity} />
        </div>
      </PullToRefresh>
    </>
  );
}
