import { useEffect, useRef, useState } from "react";
import { useGetEngagement, useListPortfolioActivity, getGetEngagementQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useFocusMode } from "@/lib/presence/focus-mode-context";
import {
  buildCelebrationQueue,
  streakMilestoneCrossed,
  type CelebrationPayload,
} from "@/lib/celebrations/build-queue";
import { computeStreak } from "@/lib/streak/compute-streak";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TOAST_ADVANCE_MS = 4500;

interface EngagementAchievement {
  code: string;
  name: string;
  description: string;
}
interface EngagementData {
  achievements: EngagementAchievement[];
  newlyEarnedCodes: string[];
  dealsClosedWonSince: { dealId: string; dealName: string }[];
}

// Non-visual. Builds the list of celebration-worthy events since the
// commander's last visit (deals closed-won, achievements newly earned,
// a streak milestone crossed) and drains it through the existing toast
// store one at a time. `previousVisitAt` is passed down from
// `pages/dashboard.tsx` (see Task 11) rather than fetched here, so this
// shares the exact same "since last visit" boundary DashboardHero's
// welcome-back memory already uses — no second mutation call.
export function CelebrationWatcher({
  previousVisitAt,
}: {
  previousVisitAt: string | null | undefined;
}) {
  const { toast } = useToast();
  const { enabled: focusMode } = useFocusMode();
  const enabled = previousVisitAt !== undefined && previousVisitAt !== null;

  const engagementParams = { since: previousVisitAt ?? undefined };
  const { data: engagementWrapper, isLoading: isLoadingEngagement } = useGetEngagement(engagementParams, {
    query: { enabled, queryKey: getGetEngagementQueryKey(engagementParams) },
  });

  // Locked once per mount — otherwise every render would mint a new `since`
  // (millisecond-precision) for the activity query, triggering a continuous
  // refetch loop (same hazard `dashboard-hero.tsx`'s `since24h` guards against).
  const [ninetyDaysAgo] = useState(() => new Date(Date.now() - NINETY_DAYS_MS).toISOString());
  // 200, not 500: /v2/activity's clampLimit() (routes/v2/index.ts) hard-caps
  // every request at 200 rows server-side regardless of what's requested, so
  // asking for more would only imply headroom that can't actually be delivered.
  const { data: activityWrapper, isLoading: isLoadingActivity } = useListPortfolioActivity({
    since: ninetyDaysAgo,
    limit: 200,
  });

  const dataReady = enabled && !isLoadingEngagement && !isLoadingActivity;
  const queueRef = useRef<CelebrationPayload[] | null>(null);

  if (dataReady && queueRef.current === null) {
    const engagement = engagementWrapper?.data as EngagementData | undefined;
    const activity = activityWrapper?.data ?? [];
    const occurredAt = activity.map((e) => e.occurredAt);

    const now = new Date();
    const previous = new Date(previousVisitAt as string);
    const priorOccurredAt = occurredAt.filter((iso) => new Date(iso).getTime() <= previous.getTime());

    const streakNow = computeStreak(occurredAt, now);
    const streakBefore = computeStreak(priorOccurredAt, previous);
    const crossed = streakMilestoneCrossed(streakBefore, streakNow);

    const newlyEarnedAchievements = (engagement?.achievements ?? []).filter((a) =>
      (engagement?.newlyEarnedCodes ?? []).includes(a.code),
    );

    queueRef.current = buildCelebrationQueue({
      dealsClosedWonSince: engagement?.dealsClosedWonSince ?? [],
      newlyEarnedAchievements,
      streakMilestoneCrossed: crossed,
    });
  }
  const queue = queueRef.current;

  const drainedRef = useRef(false);
  useEffect(() => {
    if (!queue || queue.length === 0 || drainedRef.current || focusMode) return;
    drainedRef.current = true;

    let index = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    function showNext() {
      const item = queue![index];
      toast({ title: item.title, description: item.description });
      index++;
      if (index < queue!.length) timeoutId = setTimeout(showNext, TOAST_ADVANCE_MS);
    }
    showNext();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
    // Drains exactly once, the moment a non-empty queue is first computed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  return null;
}
