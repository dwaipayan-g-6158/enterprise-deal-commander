import { useState } from "react";
import { X, Moon } from "lucide-react";
import { useListPortfolioActivity, getListPortfolioActivityQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultStore } from "@/lib/storage";
import { isDismissedToday, dismissToday } from "@/lib/reflection/dismiss";

const EOD_HOUR = 16;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

// Widget — End-of-Day Reflection (PRD 4.20). Renders only from 16:00 local
// onward, summarizing today's activity (stage advances + playbook
// completions since local midnight). Structurally a sibling of Phase 2's
// WeeklyReview Friday branch, just windowed to "today" instead of "this
// week", and dismissed per-day rather than per-week.
export function EndOfDayReflection() {
  // Locked once per mount — see dashboard-hero.tsx's `since24h` comment for
  // why (otherwise every render mints a new query key and refetch-loops).
  const [now] = useState(() => new Date());
  const active = now.getHours() >= EOD_HOUR;
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  const todayWindow = {
    since: localMidnight(now).toISOString(),
    until: now.toISOString(),
    limit: 200,
  };
  const { data: activityWrapper, isLoading } = useListPortfolioActivity(todayWindow, {
    query: { enabled: active, queryKey: getListPortfolioActivityQueryKey(todayWindow) },
  });

  function handleDismiss() {
    dismissToday(defaultStore, now);
    setLocallyDismissed(true);
  }

  if (!active || locallyDismissed || isDismissedToday(defaultStore, now)) {
    return null;
  }

  const activity = activityWrapper?.data ?? [];
  const stageAdvances = activity.filter((e) => e.eventType === "deal.stage_changed").length;
  const playbookCompletions = activity.filter(
    (e) => e.eventType === "playbook.step_changed" && e.metadata?.action === "completed",
  ).length;
  const totalToday = stageAdvances + playbookCompletions;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Moon className="h-4 w-4 text-primary" />
          Today
        </CardTitle>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss today's reflection"
          className="inline-flex min-h-[44px] min-w-[44px] -mr-2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : totalToday === 0 ? (
          <p className="text-sm text-muted-foreground">A quiet day. Tomorrow's a fresh start.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            <li>{plural(stageAdvances, "stage advance")} today</li>
            <li>{plural(playbookCompletions, "playbook step")} completed</li>
            <li className="text-muted-foreground pt-1">Excellent work today.</li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
