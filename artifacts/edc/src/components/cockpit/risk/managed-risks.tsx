import { RotateCcw, Info, Zap } from "lucide-react";
import { useClearDisposition, type Alert } from "@workspace/api-client-react";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCockpitInvalidate } from "../use-invalidate";
import { relativeTime, daysUntil } from "@/components/dashboard/widgets/_shared";
import { DISPOSITION_PRESENTATION, DISPOSITION_PRIORITY } from "./disposition-presentation";
import { snoozeFieldLabel } from "./snooze-fields";

function severityChipClass(severity: string) {
  return severity === "RED"
    ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
    : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400";
}

function snoozeExpiryText(snoozeUntil: string | null): string {
  const days = daysUntil(snoozeUntil);
  if (days == null) return "Expiry pending";
  if (days <= 0) return "Expires today";
  return `Expires in ${days}d`;
}

function ManagedRiskRow({ dealId, alert }: { dealId: string; alert: Alert }) {
  const disp = alert.disposition;
  const { toast } = useToast();
  const invalidate = useCockpitInvalidate(dealId);
  const clearDisposition = useClearDisposition();

  if (!disp) return null;
  const presentation = DISPOSITION_PRESENTATION[disp.state];
  const Icon = presentation.Icon;

  const clear = async () => {
    try {
      await clearDisposition.mutateAsync({ dealId, patternCode: alert.code });
      await invalidate();
      toast({ title: "Returned to alerts", description: `${alert.code} is active again.` });
    } catch {
      toast({ title: "Action failed", description: "Could not clear disposition.", variant: "destructive" });
    }
  };

  return (
    <Item variant="outline" size="sm" className="items-start">
      <ItemMedia variant="icon" className={cn("border-transparent", presentation.bg)}>
        <Icon className={cn("h-4 w-4", presentation.text)} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex-wrap">
          <span>{alert.message}</span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[9px] font-semibold",
              severityChipClass(alert.severity),
            )}
          >
            {alert.severity}
          </span>
          {alert.explanation && (
            <HoverCard openDelay={150}>
              <HoverCardTrigger asChild>
                <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground" />
              </HoverCardTrigger>
              <HoverCardContent className="w-72 text-xs space-y-1.5">
                <p className="font-medium text-foreground">Why this fired</p>
                {alert.explanation.inputs.map((i, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{i.label}</span>
                    <span className="font-mono">{String(i.value ?? "")}</span>
                  </div>
                ))}
                <p className="text-muted-foreground pt-1">
                  <span className="font-medium text-foreground">Clears when:</span> {alert.explanation.clearsWhen}
                </p>
              </HoverCardContent>
            </HoverCard>
          )}
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          {presentation.label}
          {disp.createdBy ? ` by ${disp.createdBy}` : ""}
          {disp.createdAt ? ` · ${relativeTime(disp.createdAt)}` : ""}
        </ItemDescription>
        {disp.state === "accept" && disp.rationale && (
          <HoverCard openDelay={150}>
            <HoverCardTrigger asChild>
              <p className="cursor-help text-xs italic text-foreground/80 underline decoration-dotted underline-offset-2 line-clamp-1">
                &ldquo;{disp.rationale}&rdquo;
              </p>
            </HoverCardTrigger>
            <HoverCardContent className="w-72 whitespace-pre-wrap text-xs">
              {disp.rationale}
            </HoverCardContent>
          </HoverCard>
        )}
        {disp.state === "snooze" && (
          <p className="text-xs text-muted-foreground">
            {snoozeExpiryText(disp.snoozeUntil ?? null)}
            {disp.snoozeUntilFieldChange
              ? ` · or if ${snoozeFieldLabel(disp.snoozeUntilFieldChange)} changes`
              : ""}
          </p>
        )}
        {alert.intervention && (
          <p className="flex items-center gap-1 text-xs text-primary">
            <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
            {alert.intervention.name}
          </p>
        )}
      </ItemContent>
      <ItemActions>
        <Button
          size="sm"
          variant="ghost"
          onClick={clear}
          disabled={clearDisposition.isPending}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Return to alerts
        </Button>
      </ItemActions>
    </Item>
  );
}

/**
 * Managed risks grouped by disposition, in priority order (snoozed — still
 * time-boxed and worth watching — before acknowledged, before accepted —
 * a settled decision). Each row surfaces who disposed of it, when, and (for
 * accept) the rationale, so "Accepted" and "Acknowledged" read as distinct
 * decisions rather than two shades of the same badge.
 */
export function ManagedRisks({ dealId, managedAlerts }: { dealId: string; managedAlerts: Alert[] }) {
  const groups = DISPOSITION_PRIORITY.map((state) => ({
    state,
    alerts: managedAlerts.filter((a) => a.disposition?.state === state),
  })).filter((g) => g.alerts.length > 0);

  return (
    <div className="space-y-4">
      {groups.map(({ state, alerts }) => {
        const presentation = DISPOSITION_PRESENTATION[state];
        const Icon = presentation.Icon;
        return (
          <div key={state}>
            <div className="flex items-center gap-1.5 px-1 pb-1.5">
              <Icon className={cn("h-3.5 w-3.5", presentation.text)} />
              <span className={cn("text-[11px] font-semibold uppercase tracking-wide", presentation.text)}>
                {presentation.label}
              </span>
              <span className="text-[11px] text-muted-foreground">· {alerts.length}</span>
            </div>
            <ItemGroup className="gap-2">
              {alerts.map((alert) => (
                <ManagedRiskRow key={alert.code} dealId={dealId} alert={alert} />
              ))}
            </ItemGroup>
          </div>
        );
      })}
    </div>
  );
}
