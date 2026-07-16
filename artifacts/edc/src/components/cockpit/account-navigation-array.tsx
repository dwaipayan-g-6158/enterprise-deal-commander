import { useEffect, useRef, useState, type ReactNode } from "react";
import { useListDeals } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Plus, Trophy, Ban } from "lucide-react";
import { formatCurrency } from "./use-invalidate";
import { cn } from "@/lib/utils";
import { CreateDealSheet } from "./create-deal-sheet";
import { groupDeals, type StripDeal, type StripGroupId } from "./deal-strip-model";

const healthBorder: Record<string, string> = {
  RED: "border-l-destructive",
  YELLOW: "border-l-amber-500",
  GREEN: "border-l-emerald-500",
};

const healthText: Record<string, string> = {
  RED: "text-destructive",
  YELLOW: "text-amber-600 dark:text-amber-400",
  GREEN: "text-emerald-600 dark:text-emerald-400",
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

export function AccountNavigationArray({ activeDealId, expandedGroup, onExpandGroup }: Props) {
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const { data } = useListDeals({ state: "active", limit: 500 });
  const reduce = !!useReducedMotion();

  const groups = groupDeals<StripDealItem>((data?.data ?? []) as StripDealItem[]);
  const openCount = groups.open.length;
  const closedCount = groups.won.length + groups.lost.length;

  // Center the active deal's card in the strip when it changes or the fanned
  // group changes, so the open deal stays visible even with many deals.
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

  const renderCard = (deal: StripDealItem, index: number, accent?: "won" | "lost") => {
    const active = deal.id === activeDealId;
    const borderClass = accent
      ? accent === "won"
        ? "border-l-emerald-500"
        : "border-l-rose-500"
      : healthBorder[deal.healthStatus] ?? "border-l-border";
    const tcvClass = accent
      ? "text-muted-foreground"
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
                  <span className="px-3 text-sm text-muted-foreground">No open deals</span>
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
                  <span className="px-3 text-sm text-muted-foreground">No closed deals yet</span>
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

          <motion.div layout={!reduce} className="flex-shrink-0 ml-1">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Deal
            </Button>
          </motion.div>
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
        won
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
          : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400",
      )}
    >
      {won ? <Trophy className="h-4 w-4" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
      <span className="text-[10px] font-bold uppercase tracking-wide leading-none">
        {won ? "Won" : "Lost"}
      </span>
      <span
        className={cn(
          "rounded-full px-1.5 font-mono text-[11px] leading-[15px]",
          won ? "bg-emerald-500/15" : "bg-rose-500/15",
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
