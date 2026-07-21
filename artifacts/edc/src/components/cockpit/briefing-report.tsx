import { useId, type ReactNode } from "react";
import type { Deal, Intelligence } from "@workspace/api-client-react";
import { CheckCircle, AlertTriangle, ShieldAlert, Lock } from "lucide-react";
import { formatCurrency } from "./use-invalidate";
import { PETAL_PATHS, VIEW_BOX } from "@/components/edc-logo-mark";

// The branded document rendered on screen, captured to PNG (html-to-image),
// and printed to PDF (window.print()). Every color below is a HARDCODED
// literal (Tailwind's static slate/red/amber/emerald palette, or bracket-hex
// brand values) — never a `bg-background` / `text-muted-foreground` / theme
// CSS-variable class. Those variables flip with the app's light/dark theme;
// this report is always "light paper" regardless of the viewer's theme, so
// it must not depend on them. See docs/superpowers/specs — Briefing export.

// Historical replay (BriefingDealContent's `asOf`) recomputes alerts/technical
// track through `@workspace/engine`, whose types are structurally close to
// but not identical to the generated API schema (e.g. engine `Severity`
// includes "GREEN"; engine `Gate` omits `sortOrder`). BriefingReport only
// reads the few scalar fields below, so these are intentionally minimal
// structural types — assignable from either the live API `Intelligence`
// or the engine's recomputed result, instead of pinning to one schema.
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

function EdcReportLogo({ size = 28 }: { size?: number }) {
  const uid = useId().replace(/:/g, "");
  const gradientId = `edc-report-logo-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7AA0F5" />
          <stop offset="45%" stopColor="#5B8DEF" />
          <stop offset="100%" stopColor="#3E6FD9" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`} fillRule="evenodd" clipRule="evenodd">
        {PETAL_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.2em] text-[#3E6FD9]">
        {children}
      </h2>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function healthTone(health: string) {
  if (health === "RED") return { text: "text-[#DC2626]", dot: "bg-[#DC2626]" };
  if (health === "YELLOW") return { text: "text-[#D97706]", dot: "bg-[#D97706]" };
  return { text: "text-[#059669]", dot: "bg-[#059669]" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BriefingReport({
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
  const tone = healthTone(health);
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

  const reportDateLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="text-slate-700">
      {/* Masthead */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-[#16181C]">
            <EdcReportLogo />
          </div>
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-900">
              Enterprise Deal Commander
            </p>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.32em] text-slate-400">
              Commander Console
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#3E6FD9]">
            Executive Briefing
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Lock className="h-2.5 w-2.5 text-[#5B8DEF]" />
            Confidential · Internal Use Only
          </div>
        </div>
      </div>

      <div className="my-6 h-[3px] rounded-full bg-gradient-to-r from-[#3E6FD9] via-[#5B8DEF] to-[#7AA0F5]" />

      {/* Title block */}
      <div>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-slate-900">
          {deal.dealName}
        </h1>
        <p className="mt-1.5 text-lg text-slate-500">{deal.accountName}</p>
      </div>

      {/*
        Flexbox, not CSS Grid: html-to-image (dom-to-image under the hood)
        has known bugs serializing `display: grid` into its exported
        SVG/canvas (content overflows the intended box). Flex is captured
        reliably, so every multi-column layout in this report uses it.
      */}
      <div className="mt-6 flex divide-x divide-slate-200 overflow-hidden rounded-md border border-slate-200">
        <div className="flex-1 bg-white px-4 py-3">
          <p className="text-[9.5px] uppercase tracking-wider text-slate-400">
            Report Date
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {reportDateLabel}
          </p>
        </div>
        <div className="flex-1 bg-white px-4 py-3">
          <p className="text-[9.5px] uppercase tracking-wider text-slate-400">
            As Of
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {isHistorical ? formatDate(date) : "Current"}
          </p>
        </div>
        <div className="flex-1 bg-white px-4 py-3">
          <p className="text-[9.5px] uppercase tracking-wider text-slate-400">
            Sales Stage
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {intel.salesStage}
          </p>
        </div>
        <div className="flex-1 bg-white px-4 py-3">
          <p className="text-[9.5px] uppercase tracking-wider text-slate-400">
            Account Manager
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {intel.team.accountManager}
          </p>
        </div>
      </div>

      {/* KPI band */}
      <div className="mt-8 flex gap-4">
        <div className="flex-1 break-inside-avoid rounded-lg border border-slate-200 bg-white px-5 py-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Normalized TCV
          </p>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-slate-900">
            {formatCurrency(
              intel.financials.normalizedTCV,
              intel.financials.reportingCurrency,
            )}
          </p>
          <p className="mt-2 text-[11.5px] text-slate-400">
            Total contract value
          </p>
        </div>
        <div className="flex-1 break-inside-avoid rounded-lg border border-slate-200 bg-white px-5 py-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Health Status
          </p>
          <p className={`mt-3 flex items-center gap-2 text-[28px] font-bold ${tone.text}`}>
            <span className={`h-3 w-3 rounded-full ${tone.dot}`} />
            {health}
          </p>
          <p className="mt-2 text-[11.5px] text-slate-400">{riskSummary}</p>
        </div>
        <div className="flex-1 break-inside-avoid rounded-lg border border-slate-200 bg-white px-5 py-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Technical Progress
          </p>
          <p className="mt-3 font-mono text-[28px] font-bold tabular-nums text-slate-900">
            {technicalTrack.progressPercentage}%
          </p>
          <p className="mt-2 text-[11.5px] text-slate-400">
            {technicalTrack.stepsCompleted} of {technicalTrack.totalSteps}{" "}
            validation gates
          </p>
        </div>
      </div>

      {isHistorical && (
        <div className="mt-8 break-inside-avoid rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Showing technical validation and risk posture reconstructed as of{" "}
          {formatDate(date)}. Deal economics and sales stage reflect current
          values.
        </div>
      )}

      {/* Deal Overview */}
      <div className="mt-9 break-inside-avoid">
        <SectionHeader>Deal Overview</SectionHeader>
        <div className="flex gap-7">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Sales Stage
            </p>
            <p className="mt-1.5 text-[17px] text-slate-900">
              {intel.salesStage}
            </p>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              {intel.daysInStage} days in stage
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Team
            </p>
            <p className="mt-1.5 text-[17px] text-slate-900">
              {intel.team.accountManager}
            </p>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              Technical: {intel.team.technicalLead}
            </p>
          </div>
        </div>
      </div>

      {/* Strategic Blueprint */}
      {deal.managerStrategicBlueprint && (
        <div className="mt-9 break-inside-avoid">
          <SectionHeader>Strategic Blueprint</SectionHeader>
          <p className="max-w-[68ch] text-[15px] leading-relaxed text-slate-700">
            {deal.managerStrategicBlueprint}
          </p>
        </div>
      )}

      {/* Risk Posture */}
      <div className="mt-9">
        <SectionHeader>Risk Posture</SectionHeader>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 break-inside-avoid text-[#059669]">
            <CheckCircle className="h-5 w-5" />
            <span className="text-lg">No active risk patterns.</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {alerts.map((a) => (
              <div
                key={a.code}
                className={`flex items-start gap-3 break-inside-avoid rounded-md border border-slate-200 border-l-4 px-4 py-3 ${
                  a.severity === "RED"
                    ? "border-l-[#DC2626] bg-[#FEF2F2]"
                    : "border-l-[#D97706] bg-[#FFFBEB]"
                }`}
              >
                {a.severity === "RED" ? (
                  <ShieldAlert className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#DC2626]" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#D97706]" />
                )}
                <div>
                  <p className="text-[14.5px] leading-relaxed text-slate-900">
                    {a.message}
                  </p>
                  {a.disposition && (
                    <span className="mt-1.5 inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10.5px] font-semibold capitalize text-slate-500">
                      {a.disposition.state}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-2.5 w-2.5 text-[#5B8DEF]" />
          <span className="font-semibold text-slate-500">
            Enterprise Deal Commander
          </span>{" "}
          · Confidential — Internal Use Only
        </span>
        <span>
          Generated {generatedAt}
          {snapshotAsOf && (
            <>
              {" "}
              · Snapshot as of {new Date(snapshotAsOf).toLocaleString()}
              {snapshotReconstructed ? " (reconstructed)" : ""}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
