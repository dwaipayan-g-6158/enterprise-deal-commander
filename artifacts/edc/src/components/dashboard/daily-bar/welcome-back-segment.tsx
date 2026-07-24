import { useLocation } from "wouter";
import { History } from "lucide-react";
import {
  useListPortfolioActivity,
  getListPortfolioActivityQueryKey,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Daily Bar segment — Welcome Back (formerly the "Last session you:" box in
// `dashboard-hero.tsx`, PRD 4.2). Same activity-since-previous-visit query as
// before; only the presentation moved into a compact bar trigger + popover.
// Renders nothing when there's no previous visit or no activity since it —
// same "absent, not empty" behavior the original box already had. No dismiss
// control: like Mission, this just reflects what happened and goes away on
// its own once there's nothing left to report.
export function WelcomeBackSegment({
  previousVisitAt,
}: {
  previousVisitAt: string | null | undefined;
}) {
  const [, navigate] = useLocation();
  const enabled = previousVisitAt !== undefined && previousVisitAt !== null;
  const params = { since: previousVisitAt ?? undefined, limit: 20 };
  const { data: wrapper } = useListPortfolioActivity(params, {
    query: { enabled, queryKey: getListPortfolioActivityQueryKey(params) },
  });
  const activity = wrapper?.data ?? [];

  if (!enabled || activity.length === 0) return null;

  const mostRecentDealId = activity[0]?.dealId;
  const count = activity.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 min-h-[44px] text-sm hover:bg-muted/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Last visit: ${count} update${count === 1 ? "" : "s"}`}
        >
          <History className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">Last visit</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            ({count})
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-semibold mb-2">Last session you:</p>
        <ul className="space-y-1">
          {activity.slice(0, 5).map((e) => (
            <li key={e.id} className="text-sm text-muted-foreground">
              ✓ {e.summary}
            </li>
          ))}
        </ul>
        {mostRecentDealId && (
          <button
            type="button"
            onClick={() => navigate(`/deals/${mostRecentDealId}`)}
            className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            Continue where you left off →
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
