import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, humanizeCode } from "@/lib/format";
import { HEALTH_CLASS } from "@/lib/semantic-colors";
import { useGetDealIntelligence, useListPipelineStages } from "@workspace/api-client-react";
import { AdminOnly } from "@/components/auth/write-gate";
import { moveIntent, terminalOutcome, toBoardStage, type BoardStage } from "@/components/roster/model/board";
import { prefersReducedMotion } from "@/mobile/lib/view-transition-support";
import { useShellScrollRef } from "@/mobile/shell/m-shell";
import { panelHref } from "@/mobile/nav/routes";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { WriteErrorInline } from "@/mobile/write/write-error-inline";
import type { WriteOutcome } from "@/mobile/write/write-outcome";
import {
  useStageAdvance,
  OVERRIDE_REASON_MIN_LENGTH,
  type GuardrailBlock,
} from "@/mobile/write/use-stage-advance";

/**
 * Where the deal is in the pipeline, and the one write that moves it.
 *
 * ## Forward only, and never into a terminal stage
 *
 * Moving backward is a different act with its own audit meaning — a correction,
 * not an advance — and it is rare enough to be desktop work. Closing is excluded
 * for a harder reason: `close-deal-dialog.tsx` collects a loss archetype, a loss
 * reason and a competitor, and those write the Deal Memory record the entire
 * Memory tab is built on. Shipping a close without them would file an autopsy
 * with a hole in it, and nobody would notice until they went looking months
 * later.
 *
 * ## The guardrail is the reason this is a screen
 *
 * Advancing past an open RED alert returns 409 STAGE_GUARDRAIL. That refusal
 * needs room: the patterns that caused it, each tappable through to the alert
 * that would clear it, and — only then, and quieter — the override. A sheet
 * cannot hold that, and vaul repositions itself when the keyboard opens, which
 * fights iOS exactly when someone is typing a justification.
 */
export function StagePanel({ dealId }: PanelBodyProps) {
  const intelQuery = useGetDealIntelligence(dealId);
  const stagesQuery = useListPipelineStages();
  const { advance, isPending } = useStageAdvance(dealId);

  const [guardrail, setGuardrail] = useState<GuardrailBlock | null>(null);
  const [target, setTarget] = useState<BoardStage | null>(null);
  const [outcome, setOutcome] = useState<WriteOutcome | null>(null);
  // Preserved across a failure on purpose. Losing two hundred characters of
  // justification to a dropped connection is the fastest way to make somebody
  // stop using the app.
  const [reason, setReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  const intel = intelQuery.data?.data;
  const stages = useMemo(
    () => (stagesQuery.data?.data ?? []).map(toBoardStage).sort((a, b) => a.sortOrder - b.sortOrder),
    [stagesQuery.data],
  );

  const current = useMemo(
    () => stages.find((s) => s.name === intel?.salesStage),
    [stages, intel],
  );

  const forward = useMemo(() => {
    if (!current) return [];
    return stages.filter(
      (s) => moveIntent(current.sortOrder, s.sortOrder) === "forward" && s.terminal == null,
    );
  }, [stages, current]);

  const alreadyClosed = intel ? terminalOutcome(intel.salesStage) != null : false;

  async function run(next: BoardStage, overrideReason?: string) {
    setOutcome(null);
    const result = await advance(next, overrideReason ? { overrideReason } : {});
    if (result.status === "ok") {
      setGuardrail(null);
      setTarget(null);
      setShowOverride(false);
      setReason("");
      return;
    }
    if (result.status === "blocked") {
      setGuardrail(result.guardrail);
      setTarget(next);
      return;
    }
    setOutcome(result.outcome);
  }

  return (
    <PanelBody loading={intelQuery.isLoading || stagesQuery.isLoading} error={intelQuery.isError}>
      {intel ? (
        <>
          <MobileCard>
            <CardHeader label="Current stage" />
            <p className="m-title">{intel.salesStage}</p>
            <p className="m-caption m-muted mt-1">
              {intel.daysInStage}d in stage
              {intel.stageEnteredAt ? ` · entered ${formatDate(intel.stageEnteredAt, "—")}` : ""}
            </p>
            {intel.financials.expectedCloseDate ? (
              <p className="m-caption m-muted mt-0.5">
                Expected close {formatDate(intel.financials.expectedCloseDate, "—")}
                {intel.financials.daysToClose != null
                  ? ` · ${intel.financials.daysToClose < 0 ? `${Math.abs(intel.financials.daysToClose)}d overdue` : `in ${intel.financials.daysToClose}d`}`
                  : ""}
              </p>
            ) : null}
          </MobileCard>

          <StageRail stages={stages} currentName={intel.salesStage} />

          {guardrail && target ? (
            <GuardrailBranch
              dealId={dealId}
              guardrail={guardrail}
              target={target}
              reason={reason}
              onReason={setReason}
              showOverride={showOverride}
              onShowOverride={() => setShowOverride(true)}
              onCancel={() => {
                setGuardrail(null);
                setTarget(null);
                setShowOverride(false);
              }}
              onOverride={() => run(target, reason)}
              pending={isPending}
              outcome={outcome}
            />
          ) : (
            <AdminOnly>
              <MobileCard>
                <CardHeader label="Advance to" />
                {alreadyClosed ? (
                  <p className="m-body m-muted">
                    This deal is decided. Reopening it is a desktop action.
                  </p>
                ) : forward.length === 0 ? (
                  <p className="m-body m-muted">
                    Nothing further to advance to from here. Closing a deal collects a loss
                    archetype and a competitor, which is desktop work — that record is what the
                    Memory tab is built on.
                  </p>
                ) : (
                  <ul className="-mx-4 -mb-4">
                    {forward.map((stage, i) => (
                      <li key={stage.id} className={cn(i > 0 && "border-t border-border")}>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => void run(stage)}
                          className="m-tap m-press flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
                        >
                          <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          <span className="m-headline min-w-0 flex-1 truncate">{stage.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <WriteErrorInline outcome={outcome} />
              </MobileCard>
            </AdminOnly>
          )}
        </>
      ) : null}
    </PanelBody>
  );
}

/** The pipeline, with the deal's position on it. */
function StageRail({ stages, currentName }: { stages: BoardStage[]; currentName: string }) {
  const currentIndex = stages.findIndex((s) => s.name === currentName);

  return (
    <MobileCard>
      <CardHeader label="Pipeline" />
      <ol className="space-y-0">
        {stages.map((stage, i) => {
          const passed = currentIndex >= 0 && i < currentIndex;
          const here = i === currentIndex;
          return (
            <li key={stage.id} className="flex items-start gap-3 py-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  // Advancing is the one write on this screen, and the rail is
                  // what it changes. Transitioning the border and fill makes the
                  // marker travel down the pipeline rather than reappear one
                  // rung lower.
                  "m-tint-shift",
                  here && "border-primary bg-primary",
                  passed && "border-primary/40 bg-primary/40",
                  !here && !passed && "border-border",
                )}
              >
                {passed ? (
                  <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3.5} />
                ) : null}
              </span>
              {/* One rung per element. The rungs are unlayered, so `m-body`
                  alongside `m-headline` is two author rules fighting over the
                  same properties — which is exactly what type-usage.test.ts
                  exists to catch, and did. */}
              <span className={cn(here ? "m-headline" : "m-body", !here && !passed && "m-muted")}>
                {stage.name}
                {here ? <span className="sr-only"> — current stage</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </MobileCard>
  );
}

/**
 * Brings a just-revealed block fully into view, clear of the floating chrome.
 *
 * "In place, not a modal" only holds if the answer is actually on screen.
 * Measured on the deployed app: the 409 branch rendered below the fold with the
 * screen still at scrollTop 0, so both of its actions landed inside the band the
 * Commander capsule floats in — and a hit test at the centre of "Advance anyway"
 * returned the Intelligence tab underneath it, which would have left the deal
 * entirely.
 *
 * The target is NOT the container's bottom edge. That edge sits behind the tab
 * bar and the Commander capsule, so aligning to it leaves the block technically
 * on screen and still untappable — measured, after a first attempt did exactly
 * that: the section fit the viewport and a hit test on "Advance anyway" still
 * returned the capsule, and one on "Cancel" still returned the Intelligence tab.
 *
 * The scroller's own `padding-bottom` (`pb-tabbar`) is the app's declaration of
 * how much of its bottom edge is spoken for, so that is what gets subtracted —
 * reading it rather than hard-coding a pixel count keeps this correct if the
 * chrome's height ever changes. `scrollIntoView` cannot express this: its
 * `block: "end"` aligns against the scrollport's padding box, which is the very
 * edge that is occluded.
 */
function useRevealedBelowFold<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const scrollRef = useShellScrollRef();

  useEffect(() => {
    const el = ref.current;
    const scroller = scrollRef.current;
    if (!el || !scroller) return;

    const reserved = Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
    const usableBottom = scroller.getBoundingClientRect().bottom - reserved;
    const overshoot = el.getBoundingClientRect().bottom - usableBottom;
    if (overshoot <= 0) return;

    scroller.scrollTo({
      top: Math.min(scroller.scrollTop + overshoot, scroller.scrollHeight - scroller.clientHeight),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [scrollRef]);

  return ref;
}

/**
 * The 409, in place.
 *
 * No modal. The reader asked to advance and the server said no; replacing the
 * picker with the refusal keeps the answer where the question was asked, and
 * leaves the pattern rows tappable through to the screen that clears them.
 *
 * "Fix it first" is the primary action and the override is deliberately quieter,
 * because the override is not the normal path — it is a documented exception,
 * persisted to `deal_stage_overrides` and audited.
 */
function GuardrailBranch({
  dealId,
  guardrail,
  target,
  reason,
  onReason,
  showOverride,
  onShowOverride,
  onCancel,
  onOverride,
  pending,
  outcome,
}: {
  dealId: string;
  guardrail: GuardrailBlock;
  target: BoardStage;
  reason: string;
  onReason: (value: string) => void;
  showOverride: boolean;
  onShowOverride: () => void;
  onCancel: () => void;
  onOverride: () => void;
  pending: boolean;
  outcome: WriteOutcome | null;
}) {
  const short = reason.trim().length < OVERRIDE_REASON_MIN_LENGTH;
  const ref = useRevealedBelowFold();

  return (
    <section ref={ref} className="m-card border-destructive/40 p-4" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={cn("mt-0.5 h-5 w-5 shrink-0", HEALTH_CLASS.RED.text)}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 className="m-headline text-destructive">Blocked from {target.name}</h2>
          <p className="m-body m-muted mt-1 text-pretty">{guardrail.message}</p>
        </div>
      </div>

      {guardrail.patternCodes.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {guardrail.patternCodes.map((code) => (
            <li key={code}>
              <Link
                href={panelHref(dealId, "alerts")}
                className="m-tap m-press flex items-center gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <Lock className="m-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="m-body min-w-0 flex-1 truncate">{humanizeCode(code)}</span>
                <ArrowRight className="m-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 space-y-2">
        <Link
          href={panelHref(dealId, "alerts")}
          className="m-label m-press m-tap block rounded-full bg-primary py-3 text-center text-primary-foreground"
        >
          Fix it first
        </Link>

        {showOverride ? (
          <div>
            <label htmlFor="override-reason" className="m-label m-muted">
              Why this deal advances anyway
            </label>
            <textarea
              id="override-reason"
              value={reason}
              onChange={(e) => onReason(e.target.value)}
              rows={4}
              // 16px minimum, or iOS zooms the viewport on focus.
              className="m-card mt-1.5 w-full resize-none p-3 text-base outline-none"
              placeholder="This is recorded against the deal and audited."
            />
            <p className="m-caption m-muted mt-1">
              {short
                ? `${OVERRIDE_REASON_MIN_LENGTH - reason.trim().length} more characters needed`
                : "Recorded against the deal and audited."}
            </p>
            <button
              type="button"
              disabled={short || pending}
              onClick={onOverride}
              className="m-label m-press m-tap mt-2 w-full rounded-full border border-destructive py-3 text-destructive disabled:opacity-40"
            >
              Advance anyway
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onShowOverride}
            className="m-label m-press m-tap w-full rounded-full border border-border py-3"
          >
            Advance anyway
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          className="m-label m-press m-tap m-muted w-full py-2"
        >
          Cancel
        </button>
      </div>

      <WriteErrorInline outcome={outcome} />
    </section>
  );
}
