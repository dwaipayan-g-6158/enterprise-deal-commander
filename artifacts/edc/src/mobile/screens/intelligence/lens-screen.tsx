import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MNavBrand } from "@/mobile/shell/m-nav-brand";
import { MAvatar } from "@/mobile/shell/m-avatar";
import { MSegmented } from "@/mobile/ui/m-segmented";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { activeLensId, INTELLIGENCE_LENSES } from "@/mobile/nav/mobile-nav";

/**
 * The chrome shared by the three Intelligence lenses.
 *
 * ## There is no `/intelligence` route, and that is load-bearing
 *
 * The lenses navigate between `/analytics`, `/portfolio` and `/autopsy` — the
 * real desktop URLs. Inventing a `/intelligence` root would have broken the
 * deep-link parity the whole two-shell design rests on, and it would have made
 * `/intelligence` → `/intelligence/portfolio` look like a push when the reader
 * meant a lateral lens switch. The tab owns three prefixes instead.
 *
 * `MSegmented` navigates with `replace: true`, so all three lenses share ONE
 * back-stack entry: backing out of Intelligence returns you to wherever you came
 * from rather than walking you back through lenses you merely glanced at.
 *
 * ## One segmented control, and only at the root
 *
 * A screen may hold at most one of these, and only if it is a tab root — the
 * anti-nesting rule `MSegmented` documents. The pushed screens below carry a
 * back chevron and nothing else, which is what keeps the reader able to say
 * where they are.
 */
export function LensScreen({
  subtitle,
  onRefresh,
  children,
}: {
  subtitle?: ReactNode;
  onRefresh: () => Promise<unknown> | unknown;
  children: ReactNode;
}) {
  const [path] = useLocation();

  return (
    <>
      <MNavBar
        title="Intelligence"
        subtitle={subtitle}
        // Every lens derives its subtitle from a query — `sim ? … : undefined` on
        // Pipeline, `summary ? … : undefined` on Portfolio — so the line always
        // arrives late here. Reserved once for all of them rather than per lens.
        reserveSubtitle
        leading={<MNavBrand />}
        right={<MAvatar />}
      >
        <div className="px-4 pb-3">
          <MSegmented
            segments={INTELLIGENCE_LENSES.map((lens) => ({
              id: lens.id,
              label: lens.label,
              href: lens.href,
            }))}
            activeId={activeLensId(path)}
            label="Intelligence lens"
          />
        </div>
      </MNavBar>

      <PullToRefresh onRefresh={onRefresh}>
        <div className="space-y-3 p-4">{children}</div>
      </PullToRefresh>
    </>
  );
}
