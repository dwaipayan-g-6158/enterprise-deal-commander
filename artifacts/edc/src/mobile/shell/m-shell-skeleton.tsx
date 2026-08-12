import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { EdcLogoMark } from "@/components/edc-logo-mark";
import { cn } from "@/lib/utils";
import {
  MOBILE_SKELETON_TABS,
  mobileSkeletonPlan,
  type MobileSkeletonPlan,
} from "@/mobile/shell/skeleton-shape";

/**
 * Mobile first-paint chrome, shaped like the screen you are actually on.
 *
 * Mirrors the live shell's geometry (safe-area header, scrollable body, fixed tab
 * bar) so the real screen takes over with no layout pop — which is the entire
 * job, and the reason every number below is copied from the screen that draws it
 * rather than chosen to look right.
 *
 * ## Why this stays on shadcn `Skeleton` and core tokens
 *
 * It is kept eager and outside mobile-app.tsx so App.tsx can render it as the
 * Suspense fallback while the lazy mobile chunk loads. That chunk is also where
 * `mobile/styles/*.css` is imported, so at THIS component's first paint `.m-shell`,
 * `.m-skeleton`, `.m-glass` and the whole `.m-*` type ladder do not exist yet.
 * Reaching for them would render unstyled boxes on the one frame this exists to
 * control. `bg-card` stands in for `.m-glass` for the same reason.
 *
 * What IS safe is the plain-Tailwind half of the live recipe — `min-h-11`, `py-2`,
 * `h-16`, `min-h-[46px]`, `pt-safe`/`pb-safe` (the safe-area utilities are
 * declared in index.css, not the mobile sheets) — so the chrome below reuses
 * MNavBar's and MTabBar's actual class recipes instead of hardcoding the heights
 * they happen to compute to. Height then falls out by construction.
 *
 * ## Where it is actually visible
 *
 * Rarely at the Suspense call site: AppReveal is opaque at z-95 with a 250ms
 * floor, so the chunk handover almost always happens underneath it. The case that
 * shows is `MobileGuard`'s — a slow session check outlasting the mask's 1200ms
 * ceiling. Both call sites sit inside `WouterRouter` (App.tsx, mobile-app.tsx), so
 * `useLocation` here gets the router base applied.
 *
 * The static mark is deliberate, and the reason is the same one app-reveal.tsx
 * gives: this renders before the mobile chunk has downloaded, and a draw-in torn
 * down after 200ms reads as a glitch rather than a flourish. The mark the user
 * sees draw is the one that replaces this.
 */
export function MobileShellSkeleton({ plan }: { plan?: MobileSkeletonPlan }) {
  const [path] = useLocation();
  const resolved = plan ?? mobileSkeletonPlan(path);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background" aria-busy="true">
      {/* The only load announcement in the whole boot stack. AppReveal and
          BootSplash are both aria-hidden precisely so this is what gets read. */}
      <span role="status" className="sr-only">Loading Deal Commander…</span>

      <SkeletonNavBar plan={resolved} />

      <main className="flex-1 overflow-hidden">
        <SkeletonBody plan={resolved} />
      </main>

      {resolved.dockedSearch ? (
        /* Docked above the tab bar rather than in the flow, matching where Deals
           and Memory mount theirs so the keyboard opens under the thumb. */
        <div className="shrink-0 px-4 pb-2">
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ) : null}

      <SkeletonTabBar activeTab={resolved.tab} />
    </div>
  );
}

/**
 * MNavBar's recipe: `min-h-11 items-center gap-2 px-4 py-2`, the leading slot,
 * the flexible text block, the trailing control — then an optional chips row.
 */
function SkeletonNavBar({ plan }: { plan: MobileSkeletonPlan }) {
  return (
    <header className="pt-safe shrink-0 border-b border-border bg-card">
      <div className="flex min-h-11 items-center gap-2 px-4 py-2">
        {plan.pushed ? (
          /* A back chevron, not the mark. MNavBar ignores `leading` entirely once
             `backHref` is set, so drawing the mark on a pushed screen would show
             it for one frame and then drop it on handover. Sized to the same 44px
             tap box MBackLink gets. */
          <div className="flex h-11 w-11 shrink-0 -ml-2.5 items-center justify-center">
            <Skeleton className="h-5 w-5 rounded-md" />
          </div>
        ) : (
          /* The real mark, at the size MNavBrand renders it, so the handover to
             the live shell moves nothing. */
          <EdcLogoMark size={24} animated={false} />
        )}

        {/* `min-h-[46px]` only where the live screen reserves it. Both directions
            are bugs: omitting it on a tab root lets the late subtitle grow the bar
            and push the screen down 20px, and adding it on a pushed screen leaves
            20px of dead bar above content that never fills it. */}
        <div className={cn("min-w-0 flex-1", plan.reserveSubtitle && "min-h-[46px]")}>
          <Skeleton className="h-4 w-32" />
          {plan.reserveSubtitle ? <Skeleton className="mt-2 h-3 w-24" /> : null}
        </div>

        {/* The avatar's stand-in, inside the same 48px tap box `.m-tap` gives the
            live one. Sizing it to the visible 32px disc would hand over 16px
            narrower and shift the row on the swap. */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center">
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      {/* Two different controls at two different heights, both MEASURED against
          the running app rather than estimated. A single average row was wrong by
          16px on Deals and Memory and 12px on the lenses — a bigger shift than the
          one `reserveSubtitle` exists to prevent, in the same place. */}
      {plan.chipRow === "pills" ? (
        /* SegmentChips: a scroll strip of individual pills, each a 48px tap
           target, in a `px-4 pb-3` row. 48 + 12 = 60px. */
        <div className="flex items-center gap-2 overflow-x-hidden px-4 pb-3">
          <Skeleton className="h-12 w-20 shrink-0 rounded-full" />
          <Skeleton className="h-12 w-24 shrink-0 rounded-full" />
          <Skeleton className="h-12 w-16 shrink-0 rounded-full" />
        </div>
      ) : plan.chipRow === "segmented" ? (
        /* MSegmented: one grouped control, 44px including its border and `p-1`,
           in the same `px-4 pb-3` row. 44 + 12 = 56px. */
        <div className="px-4 pb-3">
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
      ) : null}
    </header>
  );
}

/** MTabBar's recipe: four flex-1 items, each `h-16` with a 1.375rem icon box. */
function SkeletonTabBar({ activeTab }: { activeTab?: string }) {
  return (
    <nav className="pb-safe shrink-0 border-t border-border bg-card">
      <div className="flex items-stretch">
        {MOBILE_SKELETON_TABS.map((tab) => (
          <div
            key={tab}
            className="flex h-16 flex-1 flex-col items-center justify-center gap-1"
          >
            {/* The active tab is tinted rather than left grey. It is not pending
                information — the URL already says which tab owns this path — and
                greying it would hand over to a bar with one tinted icon, turning a
                known fact into a visible change. 1.375rem matches MTabBar's icon
                box exactly; h-5 would hand over 2px narrower. */}
            <Skeleton
              className={cn(
                "h-[1.375rem] w-[1.375rem] rounded-md",
                tab === activeTab && "bg-primary/25",
              )}
            />
            {/* .m-micro is 11px on a 1.18 line-height, so ~13px tall. */}
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </nav>
  );
}

function SkeletonBody({ plan }: { plan: MobileSkeletonPlan }) {
  switch (plan.shape) {
    /**
     * Command. The two reserved slots are `verdict-block.tsx`'s own, and they are
     * load-bearing: this block sits above everything, so an unreserved pixel here
     * moves the whole screen. Measured at 148px → 219px before they existed.
     */
    case "command":
      return (
        <>
          <div className="px-4 pb-2 pt-4">
            <div className="min-h-[102px] space-y-3">
              <Skeleton className="h-8 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
            <div className="mt-5 min-h-[74px] space-y-3">
              <Skeleton className="h-11 w-2/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
          <div className="space-y-3 px-4 pb-6 pt-2">
            {/* NeedsBlock's fixed 336px. Fixed, not derived from a row count:
                for a list of unknown length no placeholder height is correct —
                too many rows shifts content up, too few shifts it down, and both
                were measured at ±224px. */}
            <Skeleton className="h-[336px] rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        </>
      );

    /** Deals. 132px is the resolved card height from `deals-screen.tsx`. */
    case "list":
      return (
        <div className="space-y-3 px-4 pb-6 pt-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
      );

    /** Memory. `h-28` rows, from `memory-screen.tsx`. */
    case "memory":
      return (
        <div className="space-y-3 px-4 pb-6 pt-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      );

    /**
     * Intelligence, and the pushed screens that also draw one large block per
     * card. `h-40` is the well `MChartFrame` reserves for its own loading state.
     */
    case "charts":
      return (
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ))}
        </div>
      );

    /**
     * The deal brief. Its hero is normally seeded from the card that opened it
     * (mobile/lib/shared-card.ts) — on a cold refresh there is no card to seed
     * from, so this is the fallback that hero collapses to.
     */
    case "brief":
      return (
        <div className="space-y-3 px-4 pb-6 pt-3">
          <Skeleton className="h-[168px] rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      );

    /** `PanelBody`'s own shape, which already covers all sixteen deal panels. */
    case "panel":
      return (
        <div className="space-y-3 px-4 pb-6 pt-3">
          <Skeleton className="h-24 rounded-xl" />
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            {/* ShimmerLines' shape: a last line at w-2/3, the way a real
                paragraph's is. */}
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      );
  }
}
