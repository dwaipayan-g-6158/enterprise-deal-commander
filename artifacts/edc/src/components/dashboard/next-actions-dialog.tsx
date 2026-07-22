import { useMemo } from "react";
import { useGetNextActions } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemDescription } from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { ListChecks, AlertCircle, Clock, BookOpen, CalendarCheck, type LucideIcon } from "lucide-react";
import { fmtDue, type NextActionsData, type PlaybookStep } from "@/components/dashboard/widgets/next-actions";

interface NextActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tone = "red" | "amber" | "primary" | "muted";

const TONE: Record<Tone, { bg: string; label: string; icon: string }> = {
  red: { bg: "bg-red-500/10", label: "text-red-500", icon: "text-red-600 dark:text-red-400" },
  amber: { bg: "bg-amber-500/10", label: "text-amber-500", icon: "text-amber-600 dark:text-amber-400" },
  primary: { bg: "bg-primary/10", label: "text-primary", icon: "text-primary" },
  muted: { bg: "bg-muted", label: "text-muted-foreground", icon: "text-muted-foreground" },
};

function SectionLabel({ icon: Icon, label, tone, count }: { icon: LucideIcon; label: string; tone: Tone; count: number }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", TONE[tone].label)}>
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="text-xs font-medium normal-case tracking-normal text-muted-foreground">· {count}</span>
    </p>
  );
}

function Row({
  tone,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Item asChild variant="outline" size="sm" className="items-start">
      <button type="button" onClick={onClick} className="w-full text-left">
        <ItemMedia variant="icon" className={cn("border-transparent", TONE[tone].bg)}>
          <Icon className={cn("h-4 w-4", TONE[tone].icon)} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="truncate">{title}</ItemTitle>
          <ItemDescription className="line-clamp-none">{description}</ItemDescription>
        </ItemContent>
      </button>
    </Item>
  );
}

// Full, unsliced view of the Next Actions widget — every overdue decision,
// due-this-week decision, open playbook step, and imminent close, not just
// the top-N the compact widget can fit. Playbook steps are additionally
// clustered by playbook name: the dominant category (a deal now holds one
// assignment per stage it's touched, so this list runs long) is otherwise an
// undifferentiated wall of rows.
export function NextActionsDialog({ open, onOpenChange }: NextActionsDialogProps) {
  const { data } = useGetNextActions();
  const [, navigate] = useLocation();
  const d = data?.data as NextActionsData | undefined;

  const goToDeal = (dealId: string) => {
    onOpenChange(false);
    navigate(`/deals/${dealId}`);
  };

  const playbookGroups = useMemo(() => {
    if (!d) return [];
    const order: string[] = [];
    const byPlaybook = new Map<string, PlaybookStep[]>();
    for (const step of d.playbookSteps) {
      if (!byPlaybook.has(step.playbookName)) {
        byPlaybook.set(step.playbookName, []);
        order.push(step.playbookName);
      }
      byPlaybook.get(step.playbookName)!.push(step);
    }
    return order.map((name) => ({ name, steps: byPlaybook.get(name)! }));
  }, [d]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Next Actions {d ? `(${d.pendingCount})` : ""}
          </DialogTitle>
          <DialogDescription>
            Everything that needs you across the portfolio, in full.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          {!d || d.pendingCount === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing needs you in the next 48 hours.
            </p>
          ) : (
            <>
              {d.overdue.length > 0 && (
                <section>
                  <SectionLabel icon={AlertCircle} label="Overdue" tone="red" count={d.overdue.length} />
                  <ItemGroup className="mt-2 gap-1.5">
                    {d.overdue.map((x) => (
                      <Row
                        key={x.id}
                        tone="red"
                        icon={AlertCircle}
                        title={`${x.dealName}: ${x.action}`}
                        description={`${x.owner} · ${fmtDue(x.dueDate)}`}
                        onClick={() => goToDeal(x.dealId)}
                      />
                    ))}
                  </ItemGroup>
                </section>
              )}

              {d.dueThisWeek.length > 0 && (
                <section>
                  <SectionLabel icon={Clock} label="Due this week" tone="amber" count={d.dueThisWeek.length} />
                  <ItemGroup className="mt-2 gap-1.5">
                    {d.dueThisWeek.map((x) => (
                      <Row
                        key={x.id}
                        tone="amber"
                        icon={Clock}
                        title={`${x.dealName}: ${x.action}`}
                        description={`${x.owner} · ${fmtDue(x.dueDate)}`}
                        onClick={() => goToDeal(x.dealId)}
                      />
                    ))}
                  </ItemGroup>
                </section>
              )}

              {playbookGroups.length > 0 && (
                <section>
                  <SectionLabel icon={BookOpen} label="Playbook steps" tone="primary" count={d.playbookSteps.length} />
                  <div className="mt-2 space-y-3">
                    {playbookGroups.map((group) => (
                      <div key={group.name} className="ml-1 border-l-2 border-border pl-3">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{group.name}</p>
                        <ItemGroup className="gap-1.5">
                          {group.steps.map((x) => (
                            <Row
                              key={`${x.dealId}-${x.playbookName}-${x.stepOrder}`}
                              tone="primary"
                              icon={BookOpen}
                              title={`${x.dealName}: ${x.action}`}
                              description={`Step ${x.stepOrder} of ${x.totalSteps}`}
                              onClick={() => goToDeal(x.dealId)}
                            />
                          ))}
                        </ItemGroup>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {d.upcomingCloses.length > 0 && (
                <section>
                  <SectionLabel icon={CalendarCheck} label="Upcoming closes" tone="muted" count={d.upcomingCloses.length} />
                  <ItemGroup className="mt-2 gap-1.5">
                    {d.upcomingCloses.map((x) => (
                      <Row
                        key={x.id}
                        tone="muted"
                        icon={CalendarCheck}
                        title={x.dealName}
                        description={`closes in ${x.daysToClose}d`}
                        onClick={() => goToDeal(x.id)}
                      />
                    ))}
                  </ItemGroup>
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
