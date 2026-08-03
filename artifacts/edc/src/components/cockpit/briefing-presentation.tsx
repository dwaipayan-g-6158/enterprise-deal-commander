import type { ReactNode } from "react";
import type { Deal, Intelligence } from "@workspace/api-client-react";
import { CheckCircle, AlertTriangle, ShieldAlert, Lock } from "lucide-react";
import { formatCurrency } from "./use-invalidate";
import { formatDate, formatDateTime } from "@/lib/format";
import { HEALTH_CLASS, HEALTH_SHORT_LABEL, type Health } from "@/lib/semantic-colors";
import { EdcLogoMark } from "@/components/edc-logo-mark";
import { cn } from "@/lib/utils";

// The on-screen briefing — rendered live in Briefing Mode, on the app's own
// `bg-background`/theme tokens and the cockpit's own type/spacing scale, so
// it reads as another page of the app rather than projector slides. This is
// a DELIBERATE sibling of `BriefingReport`, not a shared component:
// `BriefingReport` stays pinned to hardcoded light-paper literals because
// the SAME node it renders into feeds both PNG export (html-to-image) and
// Print/PDF (window.print()) — see that file's header comment and
// .agents/memory/briefing-export-privacy.md. This component is never
// captured or printed (briefing-mode.tsx wraps it in `print:hidden` and it
// has no `contentRef`), so it's free to use theme tokens and
// semantic-colors' shared severity classes instead.

type ReportAlert = {
  code: string;
  severity: string;
  message: string;
  disposition?: { state: string } | null;
};
type ReportTechnicalTrack = {
  progressPercentage: number;
  stepsCompleted: number;
  totalSteps: number;
};

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-primary">
        {children}
      </h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function BriefingPresentation({
  deal,
  intel,
  health,
  technicalTrack,
  alerts,
  isHistorical,
  date,
  snapshotAsOf,
  snapshotReconstructed,
}: {
  deal: Deal;
  intel: Intelligence;
  health: string;
  technicalTrack: ReportTechnicalTrack;
  alerts: ReportAlert[];
  isHistorical: boolean;
  date: string;
  snapshotAsOf?: string | null;
  snapshotReconstructed?: boolean;
}) {
  const healthCls = HEALTH_CLASS[health as Health] ?? HEALTH_CLASS.GREEN;
  const redCount = alerts.filter((a) => a.severity === "RED").length;
  const yellowCount = alerts.filter((a) => a.severity === "YELLOW").length;
  const riskSummary =
    alerts.length === 0
      ? "No active risk patterns"
      : [
          redCount > 0 ? `${redCount} critical` : null,
          yellowCount > 0
            ? `${yellowCount} watch signal${yellowCount === 1 ? "" : "s"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const reportDateLabel = formatDate(new Date(), "");
  const generatedAt = formatDateTime(new Date(), "");

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-8">
      {/* Masthead — the same EdcLogoMark used in the app's own sidebar
          (layout.tsx), not a re-drawn copy, so the briefing reads as the
          app rather than a separately-branded document. */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <EdcLogoMark size={44} animated={false} className="shrink-0" />
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-foreground">
              Enterprise Deal Commander
            </p>
            <p className="mt-0.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Commander Console
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Executive Briefing
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Lock className="h-3 w-3 text-primary" />
            Confidential · Internal Use Only
          </div>
        </div>
      </div>

      <div className="-mt-2 h-px bg-border" />

      {/* Title block */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          {deal.dealName}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {deal.accountName}
        </p>
      </div>

      <div className="flex flex-wrap divide-x divide-border overflow-hidden rounded-md border border-border">
        <div className="flex-1 basis-40 bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Report Date
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {reportDateLabel}
          </p>
        </div>
        <div className="flex-1 basis-40 bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            As Of
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {isHistorical ? formatDate(date) : "Current"}
          </p>
        </div>
        <div className="flex-1 basis-40 bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Sales Stage
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {intel.salesStage}
          </p>
        </div>
        <div className="flex-1 basis-40 bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Account Manager
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {intel.team.accountManager}
          </p>
        </div>
      </div>

      {/* KPI band */}
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[14rem] flex-1 rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Normalized TCV
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-foreground">
            {formatCurrency(
              intel.financials.normalizedTCV,
              intel.financials.reportingCurrency,
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Total contract value
          </p>
        </div>
        <div className="min-w-[14rem] flex-1 rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Health Status
          </p>
          <p
            className={cn(
              "mt-1 flex items-center gap-2 text-3xl font-bold",
              healthCls.text,
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", healthCls.dot)} />
            {/* Short form: this is text-3xl inside a min-w-[14rem] tile, where
                the long wording wraps. */}
            {HEALTH_SHORT_LABEL[health as Health] ?? health}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {riskSummary}
          </p>
        </div>
        <div className="min-w-[14rem] flex-1 rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Technical Progress
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-foreground">
            {technicalTrack.progressPercentage}%
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {technicalTrack.stepsCompleted} of {technicalTrack.totalSteps}{" "}
            validation gates
          </p>
        </div>
      </div>

      {/* No historical banner here: briefing-mode.tsx's control bar is sticky
          and turns amber with an "As of <date>" dateline whenever a snapshot
          is being replayed, so a second in-document banner said the same
          thing twice. The "As Of" cell in the meta strip above still carries
          the date itself. */}

      {/* Deal Overview */}
      <div>
        <SectionHeader>Deal Overview</SectionHeader>
        <div className="flex flex-wrap gap-6">
          <div className="min-w-[14rem] flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Sales Stage
            </p>
            <p className="mt-1 text-sm text-foreground">
              {intel.salesStage}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {intel.daysInStage} days in stage
            </p>
          </div>
          <div className="min-w-[14rem] flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Team
            </p>
            <p className="mt-1 text-sm text-foreground">
              {intel.team.accountManager}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Technical: {intel.team.technicalLead}
            </p>
          </div>
        </div>
      </div>

      {/* Strategic Blueprint */}
      {deal.managerStrategicBlueprint && (
        <div>
          <SectionHeader>Strategic Blueprint</SectionHeader>
          <p className="max-w-[66ch] text-sm leading-relaxed text-foreground/90">
            {deal.managerStrategicBlueprint}
          </p>
        </div>
      )}

      {/* Risk Posture */}
      <div>
        <SectionHeader>Risk Posture</SectionHeader>
        {alerts.length === 0 ? (
          <div className={`flex items-center gap-2 ${HEALTH_CLASS.GREEN.text}`}>
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">No active risk patterns.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => {
              const cls =
                a.severity === "RED" ? HEALTH_CLASS.RED : HEALTH_CLASS.YELLOW;
              return (
                <div
                  key={a.code}
                  className={cn(
                    "flex items-start gap-2.5 rounded-md border border-l-4 px-4 py-3",
                    cls.border,
                    cls.borderL,
                    cls.bg,
                  )}
                >
                  {a.severity === "RED" ? (
                    <ShieldAlert
                      className={cn("mt-0.5 h-4 w-4 shrink-0", cls.text)}
                    />
                  ) : (
                    <AlertTriangle
                      className={cn("mt-0.5 h-4 w-4 shrink-0", cls.text)}
                    />
                  )}
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      {a.code}
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-foreground">
                      {a.message}
                    </p>
                    {a.disposition && (
                      <span className="mt-1.5 inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-semibold capitalize text-muted-foreground">
                        {a.disposition.state}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3 text-primary" />
          <span className="font-semibold text-foreground/80">
            Enterprise Deal Commander
          </span>{" "}
          · Confidential — Internal Use Only
        </span>
        <span>
          Generated {generatedAt}
          {snapshotAsOf && (
            <>
              {" "}
              · Snapshot as of {formatDateTime(snapshotAsOf, "—")}
              {snapshotReconstructed ? " (reconstructed)" : ""}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
