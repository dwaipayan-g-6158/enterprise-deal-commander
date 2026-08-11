import { useEffect } from "react";
import {
  getGetIntelligenceSummaryQueryKey,
  useGetIntelligenceSummary,
} from "@workspace/api-client-react";
import { syncBadge } from "@/mobile/lib/app-badge";

/**
 * Keeps the home-screen icon badge in step with the red-alert count.
 *
 * This used to live in an effect on the Command screen, which meant the badge
 * froze the moment you switched tabs: the count on the icon was whatever it had
 * been when you last looked at Home, and a deal going red while you were reading
 * the Deals list never reached it. An ambient signal that only updates while you
 * are looking at the screen it summarises is not ambient.
 *
 * ## Why this adds no requests
 *
 * `enabled: false` disables automatic fetching but keeps the observer
 * subscribed to the query cache, so this mirrors whatever the Command screen has
 * already fetched and re-syncs whenever that changes — including after a
 * pull-to-refresh or the app-resume refetch. It never issues a request of its
 * own, which is the whole reason it is safe to mount app-wide.
 *
 * The consequence, stated plainly: before Home has been visited once in a
 * session there is nothing in the cache and nothing to publish. That is correct
 * — a badge invented from no data would be worse than a stale one.
 *
 * Everything else about the badge is unchanged and lives in lib/app-badge.ts:
 * it is opt-in, it no-ops entirely when the opt-in is off, and sign-out clears
 * it — a count left on the icon reports someone else's pipeline on a shared
 * device.
 */
export function MAppBadge() {
  // The key is spelled out because `enabled: false` alone is not a complete
  // options object to the generated hook — and it must be the SAME key the
  // Command screen fetches under, or this would mirror an empty cache entry
  // forever and the badge would never move.
  const { data } = useGetIntelligenceSummary({
    query: { queryKey: getGetIntelligenceSummaryQueryKey(), enabled: false },
  });
  const redAlerts = data?.data?.criticalAlertsTotal;

  useEffect(() => {
    if (redAlerts != null) void syncBadge(redAlerts);
  }, [redAlerts]);

  return null;
}
