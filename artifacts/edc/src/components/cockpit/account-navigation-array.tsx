import { useEffect, useRef, useState, type ReactNode } from "react";
import { useListDeals, useGetRosterEnrichment } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Plus, Trophy, Ban } from "lucide-react";
import { formatCurrency } from "./use-invalidate";
import { cn } from "@/lib/utils";
import { CreateDealSheet } from "./create-deal-sheet";
import { AdminOnly } from "@/components/auth/write-gate";
import { groupDeals, type StripDeal, type StripGroupId } from "./deal-strip-model";
import {
  shouldConvertWheelToHorizontalScroll,
  lerpScrollPosition,
  clampScrollTarget,
} from "./wheel-horizontal-scroll";
import { HEALTH_CLASS, OUTCOME_CLASS, RISK_LEVEL_CLASS, type RiskLevel } from "@/lib/semantic-colors";

// Sourced from the shared HEALTH_CLASS map (lib/semantic-colors.ts) — this
// used to be a private Record hardcoding GREEN as emerald, the exact
// collision this file was reported for: a low-risk open deal and a
// Closed-Won deal both rendered "border-l-emerald-500". Won/lost accent
// colours (below, in renderCard/ClusterTab) now come from OUTCOME_CLASS
// instead, so the two channels can no longer collide by construction.
//
// These are now a FALLBACK, not the primary path: useListDeals carries no
// risk level, so renderCard prefers the 4-state riskLevel from the roster
// enrichment query (below) and only falls back to 3-state health when that
// hasn't loaded (or the enrichment fetch fails) — matching roster-table.tsx's
// `row.riskLevel ? RISK_BORDER[row.riskLevel] : HEALTH_BORDER[...]` pattern.
// Without this, an ELEVATED deal painted amber here (from health YELLOW)
// while the cockpit header right next to it painted the same deal orange.
const healthBorder: Record<string, string> = {
  RED: HEALTH_CLASS.RED.borderL,
  YELLOW: HEALTH_CLASS.YELLOW.borderL,
  GREEN: HEALTH_CLASS.GREEN.borderL,
};

const healthText: Record<string, string> = {
  RED: HEALTH_CLASS.RED.text,
  YELLOW: HEALTH_CLASS.YELLOW.text,
  GREEN: HEALTH_CLASS.GREEN.text,
};

// A deal known to have the fields the strip renders. useListDeals returns a
// richer type; this is the subset the card and grouping actually touch.
type StripDealItem = StripDeal & {
  healthStatus: string;
  accountName: string;
  dealName: string;
  dealCurrency: string;
};

interface Props {
  activeDealId: string;
  /** Which stack is fanned out; the other collapses to a pile. Owned by the page. */
  expandedGroup: StripGroupId;
  onExpandGroup: (group: StripGroupId) => void;
}

const GROUP_LABEL: Record<StripGroupId, string> = { open: "Open", closed: "Closed" };

// Momentum-glide tuning: fraction of the remaining gap closed per animation
// frame, and the pixel threshold below which the glide snaps to its exact
// target and stops (no idle frames after settling).
const SCROLL_MOMENTUM_FACTOR = 0.2;
const SCROLL_MOMENTUM_EPSILON = 0.5;

export function AccountNavigationArray({ activeDealId, expandedGroup, onExpandGroup }: Props) {
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const { data } = useListDeals({ state: "active", limit: 500 });
  const enrichQuery = useGetRosterEnrichment();
  const reduce = !!useReducedMotion();

  const riskLevelById = new Map<string, RiskLevel>(
    (
      (enrichQuery.data?.data as { deals?: { id: string; riskLevel?: RiskLevel | null }[] } | undefined)
        ?.deals ?? []
    )
      .filter((e) => e.riskLevel)
      .map((e) => [e.id, e.riskLevel as RiskLevel]),
  );

  const groups = groupDeals<StripDealItem>((data?.data ?? []) as StripDealItem[]);
  const openCount = groups.open.length;
  const closedCount = groups.won.length + groups.lost.length;

  // Center the active deal's card in the strip when it changes or the fanned
  // group changes, so the open deal stays visible even with many deals.
  // Note: a wheel gesture that arrives mid-flight here will be interrupted by
  // the glide effect below taking over scrollLeft — intentional, not a bug.
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [activeDealId, expandedGroup, reduce]);

  // After the user toggles a pile, move focus into the newly fanned group —
  // the clicked pile has unmounted, so focus would otherwise fall to the body.
  // A ref gates this to genuine user toggles (not the initial auto-expansion).
  const userToggled = useRef(false);
  const togglePile = (group: StripGroupId) => {
    userToggled.current = true;
    onExpandGroup(group);
  };
  useEffect(() => {
    if (!userToggled.current) return;
    userToggled.current = false;
    requestAnimationFrame(() => {
      // Scope to the newly fanned group's own fan (its id carries the group) so
      // a fan from the previous group that is still animating out can't capture
      // focus. Prefer the active card; fall back to the first card in the group.
      const fan = navRef.current?.querySelector(`#deal-strip-fan-${expandedGroup}`);
      const target =
        fan?.querySelector<HTMLElement>('[aria-current="true"]') ??
        fan?.querySelector<HTMLElement>("[data-strip-card]");
      target?.focus({ preventScroll: true });
    });
  }, [expandedGroup]);

  // Convert a plain vertical wheel scroll into horizontal scroll of the
  // strip's own viewport, so an ordinary mouse wheel works like a trackpad's
  // horizontal swipe while hovering the strip. Registered as a real DOM
  // listener with { passive: false } — React's synthetic onWheel can't
  // reliably preventDefault() the page's own scroll in every browser — and
  // scoped to this component's viewport only, so no other ScrollArea in the
  // app is affected.
  useEffect(() => {
    // One-shot: assumes the Radix viewport exists at mount, true today since
    // <nav>/ScrollArea always render unconditionally with no loading guard.
    const viewport = navRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;

    // Accumulating target for the momentum glide, and the glide's own
    // interpolated position tracked as a float — never read back from
    // viewport.scrollLeft, since the DOM getter quantizes to whole pixels on
    // integer-DPR displays, which would stall the lerp just short of target
    // and leave the loop rescheduling forever. null on both means no glide
    // is currently in flight, so the next wheel event should seed both from
    // the viewport's actual scrollLeft rather than a stale prior value.
    let targetScrollLeft: number | null = null;
    let animatedPosition: number | null = null;
    let animationFrame: number | null = null;

    const glide = () => {
      if (targetScrollLeft === null || animatedPosition === null) return;
      const target = targetScrollLeft;
      const next = lerpScrollPosition(animatedPosition, target, SCROLL_MOMENTUM_FACTOR);
      if (Math.abs(target - next) < SCROLL_MOMENTUM_EPSILON) {
        viewport.scrollLeft = target;
        targetScrollLeft = null;
        animatedPosition = null;
        animationFrame = null;
        return;
      }
      animatedPosition = next;
      viewport.scrollLeft = next;
      animationFrame = requestAnimationFrame(glide);
    };

    const handleWheel = (event: WheelEvent) => {
      const shouldConvert = shouldConvertWheelToHorizontalScroll(
        { deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey },
        { scrollWidth: viewport.scrollWidth, clientWidth: viewport.clientWidth },
      );
      if (!shouldConvert) return;
      event.preventDefault();
      // In Chrome (unlike Firefox), Shift+wheel arrives as deltaY-dominant, so
      // it also lands here — still the correct horizontal-scroll outcome.
      // Normalize by deltaMode: Firefox reports line deltas (~3), not pixels.
      const step =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * viewport.clientWidth
            : event.deltaY;
      const max = viewport.scrollWidth - viewport.clientWidth;

      if (reduce) {
        viewport.scrollLeft = clampScrollTarget(viewport.scrollLeft + step, max);
        return;
      }

      // Seed both the target and the animated position from the strip's
      // actual current scrollLeft only when no glide is in flight, so a
      // fresh gesture always starts from wherever the strip really is (e.g.
      // after a scrollbar drag or scrollIntoView), not a stale value left
      // over from an earlier gesture.
      if (targetScrollLeft === null) {
        targetScrollLeft = viewport.scrollLeft;
        animatedPosition = viewport.scrollLeft;
      }
      targetScrollLeft = clampScrollTarget(targetScrollLeft + step, max);
      if (animationFrame === null) animationFrame = requestAnimationFrame(glide);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    };
  }, [reduce]);

  const renderCard = (deal: StripDealItem, index: number, accent?: "won" | "lost") => {
    const active = deal.id === activeDealId;
    const riskLevel = riskLevelById.get(deal.id);
    const borderClass = accent
      ? OUTCOME_CLASS[accent].borderL
      : riskLevel
        ? RISK_LEVEL_CLASS[riskLevel].borderL
        : healthBorder[deal.healthStatus] ?? "border-l-border";
    const tcvClass = accent
      ? "text-muted-foreground"
      : riskLevel
        ? RISK_LEVEL_CLASS[riskLevel].text
        : healthText[deal.healthStatus] ?? "text-muted-foreground";
    return (
      <motion.button
        key={deal.id}
        data-strip-card
        ref={active ? activeRef : undefined}
        aria-current={active ? "true" : undefined}
        onClick={() => navigate(`/deals/${deal.id}`)}
        initial={reduce || index > 30 ? false : { opacity: 0, x: -12, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{
          duration: reduce ? 0 : 0.18,
          delay: reduce ? 0 : Math.min(index, 15) * 0.025,
          ease: "easeOut",
        }}
        className={cn(
          "flex-shrink-0 flex flex-col items-start px-3 py-2 text-left border-l-4 rounded-sm",
          "hover:bg-muted transition-colors min-w-[160px] max-w-[220px]",
          borderClass,
          active ? "bg-muted ring-1 ring-primary/40" : "bg-background",
        )}
      >
        <span className="text-xs text-muted-foreground truncate w-full">
          {deal.accountName}
        </span>
        <span className="text-sm font-medium truncate w-full">{deal.dealName}</span>
        <span className={cn("text-xs font-mono", tcvClass)}>
          {formatCurrency(deal.calculatedTCV ?? 0, deal.dealCurrency)}
        </span>
      </motion.button>
    );
  };

  const openFanned = expandedGroup === "open";
  const closedFanned = expandedGroup === "closed";

  return (
    <nav ref={navRef} aria-label="Deal switcher" className="shrink-0 border-b bg-muted/30">
      {/* Radix ScrollArea: its scrollbar is an absolutely-positioned overlay, so
          the strip's height never changes when the fan overflows (a classic
          scrollbar appearing/disappearing shoved the page content ~15px). */}
      <ScrollArea className="w-full">
        {/* relative: popLayout absolutely positions exiting fans/piles against
            this row, keeping them inside the strip's clip — without a positioned
            ancestor they anchor to <body> and briefly widen the whole page. */}
        <div className="relative flex items-center gap-1 px-4 py-1">
          {/* Open segment */}
          <AnimatePresence mode="popLayout" initial={false}>
            {openFanned ? (
              <motion.div
                key="open-fan"
                id="deal-strip-fan-open"
                role="group"
                aria-label="Open deals"
                layout={!reduce}
                initial={false}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                transition={{ duration: reduce ? 0 : 0.12, ease: "easeOut" }}
                className="flex items-center gap-1"
              >
                {openCount > 0 ? (
                  groups.open.map((deal, i) => renderCard(deal, i))
                ) : (
                  <span className="px-3 text-sm text-muted-foreground">Nothing open right now</span>
                )}
              </motion.div>
            ) : (
              <StackPile
                key="open-pile"
                group="open"
                label={GROUP_LABEL.open}
                count={openCount}
                reduce={reduce}
                onExpand={togglePile}
              />
            )}
          </AnimatePresence>

          {/* Closed segment */}
          <AnimatePresence mode="popLayout" initial={false}>
            {closedFanned ? (
              <motion.div
                key="closed-fan"
                id="deal-strip-fan-closed"
                role="group"
                aria-label="Closed deals"
                layout={!reduce}
                initial={false}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                transition={{ duration: reduce ? 0 : 0.12, ease: "easeOut" }}
                className="flex items-center gap-1"
              >
                {closedCount === 0 ? (
                  <span className="px-3 text-sm text-muted-foreground">Nothing closed yet — early days</span>
                ) : (
                  <ClosedClusters
                    won={groups.won}
                    lost={groups.lost}
                    renderCard={renderCard}
                    reduce={reduce}
                  />
                )}
              </motion.div>
            ) : (
              <StackPile
                key="closed-pile"
                group="closed"
                label={GROUP_LABEL.closed}
                count={closedCount}
                reduce={reduce}
                onExpand={togglePile}
              />
            )}
          </AnimatePresence>

          <AdminOnly>
            <motion.div layout={!reduce} className="flex-shrink-0 ml-1">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Deal
              </Button>
            </motion.div>
          </AdminOnly>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <CreateDealSheet open={createOpen} onOpenChange={setCreateOpen} />
    </nav>
  );
}

function ClosedClusters({
  won,
  lost,
  renderCard,
  reduce,
}: {
  won: StripDealItem[];
  lost: StripDealItem[];
  renderCard: (deal: StripDealItem, index: number, accent?: "won" | "lost") => ReactNode;
  reduce: boolean;
}) {
  // Continuous index across the leading tab then the cluster's cards so the
  // fan-in stagger reads as one sweep, matching visualOrder()/arrow-key order.
  let index = 0;
  return (
    <>
      {won.length > 0 && (
        <span role="group" aria-label={`Won (${won.length})`} className="contents">
          <ClusterTab outcome="won" count={won.length} index={index++} reduce={reduce} />
          {won.map((deal) => renderCard(deal, index++, "won"))}
        </span>
      )}
      {lost.length > 0 && (
        <span role="group" aria-label={`Lost (${lost.length})`} className="contents">
          <ClusterTab
            outcome="lost"
            count={lost.length}
            index={index++}
            reduce={reduce}
            leading={won.length > 0}
          />
          {lost.map((deal) => renderCard(deal, index++, "lost"))}
        </span>
      )}
    </>
  );
}

// A full-height panel that leads each outcome cluster: the icon, label, and
// count stacked and centered, tinted by outcome. Sized to the card row via
// self-stretch so it anchors the cluster instead of floating at mid-height,
// and it doubles as the divider between Won and Lost. aria-hidden because the
// enclosing role="group" already names the cluster and its count.
function ClusterTab({
  outcome,
  count,
  index,
  reduce,
  leading = false,
}: {
  outcome: "won" | "lost";
  count: number;
  index: number;
  reduce: boolean;
  leading?: boolean;
}) {
  const won = outcome === "won";
  return (
    <motion.div
      aria-hidden
      initial={reduce || index > 30 ? false : { opacity: 0, x: -12, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{
        duration: reduce ? 0 : 0.18,
        delay: reduce ? 0 : Math.min(index, 15) * 0.025,
        ease: "easeOut",
      }}
      className={cn(
        "flex-shrink-0 self-stretch flex w-[52px] flex-col items-center justify-center gap-1 rounded-md border px-1 py-1.5",
        leading && "ml-2",
        OUTCOME_CLASS[outcome].bg,
        OUTCOME_CLASS[outcome].border,
        OUTCOME_CLASS[outcome].text,
      )}
    >
      {won ? <Trophy className="h-4 w-4" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
      <span className="text-[10px] font-bold uppercase tracking-wide leading-none">
        {won ? "Won" : "Lost"}
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 font-mono text-[11px] leading-[15px]",
          OUTCOME_CLASS[outcome].bg,
        )}
      >
        {count}
      </span>
    </motion.div>
  );
}

function StackPile({
  group,
  label,
  count,
  reduce,
  onExpand,
}: {
  group: StripGroupId;
  label: string;
  count: number;
  reduce: boolean;
  onExpand: (group: StripGroupId) => void;
}) {
  const empty = count === 0;
  const layers = Math.min(Math.max(count - 1, 0), 2);
  return (
    <motion.button
      type="button"
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
      disabled={empty}
      aria-expanded={false}
      aria-controls={`deal-strip-fan-${group}`}
      aria-label={`Show ${label.toLowerCase()} deals (${count})`}
      onClick={empty ? undefined : () => onExpand(group)}
      className={cn(
        "group relative flex-shrink-0 mx-2",
        empty ? "cursor-default opacity-50" : "cursor-pointer",
      )}
    >
      {layers > 1 && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 right-0 translate-x-[10px] scale-[0.94] rounded-md border bg-muted/40"
        />
      )}
      {layers > 0 && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 right-0 translate-x-[5px] scale-[0.97] rounded-md border bg-muted/60"
        />
      )}
      <span
        className={cn(
          "relative flex min-w-[116px] flex-col items-start gap-1 rounded-md border bg-background px-3.5 py-2 transition-colors",
          !empty && "group-hover:bg-muted",
        )}
      >
        <span className="text-sm font-semibold">{label}</span>
        <span className="rounded-full border bg-muted/40 px-2 font-mono text-[11px] leading-[17px] text-muted-foreground">
          {count} {count === 1 ? "deal" : "deals"}
        </span>
      </span>
    </motion.button>
  );
}
