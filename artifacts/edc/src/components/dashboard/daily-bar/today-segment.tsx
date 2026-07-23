import { useState } from "react";
import { useLocation } from "wouter";
import { X, Moon } from "lucide-react";
import {
  useListPortfolioActivity,
  getListPortfolioActivityQueryKey,
  useListPipelineStages,
  type ActivityEvent,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { relativeTime } from "@/components/dashboard/widgets/_shared";
import { defaultStore } from "@/lib/storage";
import { isDismissedToday, dismissToday } from "@/lib/reflection/dismiss";

const EOD_HOUR = 16;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/**
 * "{From} → {To}" using the portfolio-wide stage-name lookup, mirroring the
 * `stageNameById` pattern in cockpit/flow/{recycle-exit,conversion-matrix}.tsx.
 * `metadata` is untyped (`Record<string, unknown> | null`), so both ids are
 * guarded; an unresolvable `toStageId` yields `null` (no transition shown) —
 * the event's `summary` text still carries the plain-English fallback.
 */
function stageTransitionLabel(
  metadata: Record<string, unknown> | null | undefined,
  stageNameById: Record<number, string>,
): string | null {
  const fromStageId = typeof metadata?.fromStageId === "number" ? metadata.fromStageId : null;
  const toStageId = typeof metadata?.toStageId === "number" ? metadata.toStageId : null;
  if (toStageId == null) return null;
  const toName = stageNameById[toStageId];
  if (!toName) return null;
  if (fromStageId == null) return `→ ${toName}`;
  const fromName = stageNameById[fromStageId];
  return fromName ? `${fromName} → ${toName}` : `→ ${toName}`;
}

/**
 * One itemized activity row, mirroring the dashboard's Recent Activity list
 * shape (`pages/dashboard.tsx`): summary + relative time share the top line
 * (time pinned `shrink-0` so it's never truncated away), deal name (and stage
 * transition, when present) on a second, truncatable line below.
 */
function ActivityRow({
  event,
  transitionLabel,
  onNavigate,
}: {
  event: ActivityEvent;
  transitionLabel?: string | null;
  onNavigate: (dealId: string) => void;
}) {
  const subParts = [transitionLabel, event.dealName ?? "Deal"].filter(Boolean);
  return (
    <li className="text-sm border-l-2 border-primary/40 pl-2.5">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onNavigate(event.dealId)}
          className="min-w-0 flex-1 text-left leading-snug break-words hover:text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {event.summary}
        </button>
        <span className="shrink-0 whitespace-nowrap text-xs leading-snug text-muted-foreground">
          {relativeTime(event.occurredAt)}
        </span>
      </div>
      <p className="text-xs leading-snug break-words text-muted-foreground">{subParts.join(" · ")}</p>
    </li>
  );
}

// Daily Bar segment — Today (formerly the standalone `EndOfDayReflection`
// card, PRD 4.20). Same 16:00-local gating + per-day dismissal + activity
// query as before; only the presentation moved into a compact bar trigger +
// popover. Renders nothing (not even a trigger) outside the active window or
// once dismissed today — same "absent, not empty" behavior as the original.
export function TodaySegment() {
  const [, navigate] = useLocation();
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
  // Portfolio-wide, cached lookup — resolves stage ids on stage-advance rows
  // into real names (e.g. "Discovery → Validation") for the itemized detail.
  const { data: stagesData } = useListPipelineStages();
  const stageNameById: Record<number, string> = Object.fromEntries(
    (stagesData?.data ?? []).map((s) => [s.id, s.stageName]),
  );

  function handleDismiss() {
    dismissToday(defaultStore, now);
    setLocallyDismissed(true);
  }

  if (!active || locallyDismissed || isDismissedToday(defaultStore, now)) {
    return null;
  }

  const activity = activityWrapper?.data ?? [];
  const stageAdvanceEvents = activity.filter((e) => e.eventType === "deal.stage_changed");
  const playbookEvents = activity.filter(
    (e) => e.eventType === "playbook.step_changed" && e.metadata?.action === "completed",
  );
  const stageAdvances = stageAdvanceEvents.length;
  const playbookCompletions = playbookEvents.length;
  const totalToday = stageAdvances + playbookCompletions;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 min-h-[44px] text-sm hover:bg-muted/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isLoading ? "Today" : `Today: ${totalToday} updates`}
        >
          <Moon className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">Today</span>
          {!isLoading && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {totalToday === 0 ? "quiet" : totalToday}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Today</p>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Hide today's recap for the rest of today"
            className="inline-flex min-h-[32px] min-w-[32px] -mr-1 -mt-1 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : totalToday === 0 ? (
          <p className="text-sm text-muted-foreground">A quiet day. Tomorrow&apos;s a fresh start.</p>
        ) : (
          <div className="space-y-3">
            <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
              {stageAdvanceEvents.length > 0 && (
                <section>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {plural(stageAdvances, "stage advance")} today
                  </p>
                  <ul className="space-y-1.5">
                    {stageAdvanceEvents.map((e) => (
                      <ActivityRow
                        key={e.id}
                        event={e}
                        transitionLabel={stageTransitionLabel(
                          e.metadata as Record<string, unknown> | null | undefined,
                          stageNameById,
                        )}
                        onNavigate={(dealId) => navigate(`/deals/${dealId}`)}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {playbookEvents.length > 0 && (
                <section>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {plural(playbookCompletions, "playbook step")} completed
                  </p>
                  <ul className="space-y-1.5">
                    {playbookEvents.map((e) => (
                      <ActivityRow
                        key={e.id}
                        event={e}
                        onNavigate={(dealId) => navigate(`/deals/${dealId}`)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Excellent work today.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
