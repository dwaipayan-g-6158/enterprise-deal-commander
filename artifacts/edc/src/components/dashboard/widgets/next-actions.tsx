import { useGetNextActions } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ListChecks, AlertCircle, Clock, BookOpen, CalendarCheck } from "lucide-react";

interface Decision {
  id: string;
  dealId: string;
  dealName: string;
  accountName: string;
  action: string;
  owner: string;
  dueDate: string;
}
export interface PlaybookStep {
  dealId: string;
  dealName: string;
  playbookName: string;
  action: string;
  stepOrder: number;
  totalSteps: number;
}
interface UpcomingClose {
  id: string;
  dealName: string;
  accountName: string;
  daysToClose: number;
}
export interface NextActionsData {
  overdue: Decision[];
  dueThisWeek: Decision[];
  playbookSteps: PlaybookStep[];
  upcomingCloses: UpcomingClose[];
  pendingCount: number;
}

export function fmtDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  return `in ${days}d`;
}

// Widget 7 — Next Actions / What Needs Me. The 48-hour priority list, grouped by
// urgency: overdue → due this week → playbook steps → upcoming closes.
export function NextActions({ onViewAll }: { onViewAll: () => void }) {
  const { data, isLoading } = useGetNextActions();
  const [, navigate] = useLocation();
  const d = data?.data as NextActionsData | undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-primary" />
          Next Actions {d ? `(${d.pendingCount})` : ""}
        </CardTitle>
        {d && d.pendingCount > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            View all →
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !d ? (
          <Skeleton className="h-48 w-full" />
        ) : d.pendingCount === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs you in the next 48 hours.</p>
        ) : (
          <>
            {d.overdue.length > 0 && (
              <Group icon={<AlertCircle className="h-3.5 w-3.5" />} label="Overdue" tone="text-red-500">
                {d.overdue.slice(0, 3).map((x) => (
                  <Item
                    key={x.id}
                    onClick={() => navigate(`/deals/${x.dealId}`)}
                    title={`${x.dealName}: ${x.action}`}
                    meta={`${x.owner} · ${fmtDue(x.dueDate)}`}
                    overdue
                  />
                ))}
              </Group>
            )}
            {d.dueThisWeek.length > 0 && (
              <Group icon={<Clock className="h-3.5 w-3.5" />} label="Due this week" tone="text-amber-500">
                {d.dueThisWeek.slice(0, 3).map((x) => (
                  <Item
                    key={x.id}
                    onClick={() => navigate(`/deals/${x.dealId}`)}
                    title={`${x.dealName}: ${x.action}`}
                    meta={`${x.owner} · ${fmtDue(x.dueDate)}`}
                  />
                ))}
              </Group>
            )}
            {d.playbookSteps.length > 0 && (
              <Group icon={<BookOpen className="h-3.5 w-3.5" />} label="Playbook steps" tone="text-primary">
                {d.playbookSteps.slice(0, 2).map((x) => (
                  <Item
                    key={`${x.dealId}-${x.playbookName}-${x.stepOrder}`}
                    onClick={() => navigate(`/deals/${x.dealId}`)}
                    title={`${x.dealName}: ${x.action}`}
                    meta={`${x.playbookName} · Step ${x.stepOrder} of ${x.totalSteps}`}
                  />
                ))}
              </Group>
            )}
            {d.upcomingCloses.length > 0 && (
              <Group icon={<CalendarCheck className="h-3.5 w-3.5" />} label="Upcoming closes" tone="text-muted-foreground">
                {d.upcomingCloses.slice(0, 2).map((x) => (
                  <Item
                    key={x.id}
                    onClick={() => navigate(`/deals/${x.id}`)}
                    title={`${x.dealName}`}
                    meta={`closes in ${x.daysToClose}d`}
                  />
                ))}
              </Group>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Group({
  icon,
  label,
  tone,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${tone}`}>
        {icon}
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Item({
  onClick,
  title,
  meta,
  overdue,
}: {
  onClick: () => void;
  title: string;
  meta: string;
  overdue?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-2 py-1 -mx-2 text-left transition-colors hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className={`truncate text-sm ${overdue ? "font-medium" : ""}`}>{title}</p>
      <p className="text-xs text-muted-foreground">{meta}</p>
    </button>
  );
}
