import { Redirect } from "wouter";
import { cn } from "@/lib/utils";
import { compactCurrency, humanizeCode } from "@/lib/format";
import {
  useGetAutopsy,
  useGetLossRisk,
  useGetProductGaps,
} from "@workspace/api-client-react";
import { HEALTH_CLASS } from "@/lib/semantic-colors";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { ListRow } from "@/mobile/components/list-row";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { lossSubById } from "@/mobile/nav/routes";

/**
 * The three pushed screens behind the Losses lens.
 *
 * One host and a table lookup, the same shape the deal panels use — the nav bar,
 * the back target and the title are identical on all three, so writing them
 * three times would be three chances for them to drift.
 */
export function LossDetailScreen({ sub }: { sub: string }) {
  const meta = lossSubById(sub);

  // An unknown segment is a mistyped or stale URL. Falling back to the lens is
  // where the reader was heading anyway. `transition={false}` because <Redirect>
  // navigates from a layout effect, where aroundNav's flushSync is unsafe.
  if (!meta) return <Redirect to="/autopsy" transition={false} />;

  return (
    <>
      <MNavBar title={meta.title} backHref="/autopsy" backLabel="Back to Intelligence" />
      {sub === "early-warning" ? (
        <EarlyWarning />
      ) : sub === "archetypes" ? (
        <Archetypes />
      ) : (
        <ProductGaps />
      )}
    </>
  );
}

/**
 * Live deals matching the patterns that preceded past losses.
 *
 * The score is lethality-weighted, so it is not "how many patterns fired" but
 * "how deadly the ones that did have been". A deal with one historically fatal
 * pattern outranks a deal with three survivable ones, which is the whole point
 * of scoring it against the archive rather than counting.
 */
function EarlyWarning() {
  const query = useGetLossRisk();
  const data = query.data?.data;
  const deals = data?.deals ?? [];

  return (
    <PullToRefresh onRefresh={query.refetch}>
      <div className="space-y-3 p-4">
        {query.isError ? (
          <ErrorState
            title="Couldn't load early warning"
            body="Pull down to try again, or check your connection."
          />
        ) : query.isLoading ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : deals.length === 0 ? (
          <EmptyState
            title="Nothing matches a past loss"
            body={
              data && data.lostDealCount > 0
                ? `No live deal currently matches the patterns behind the ${data.lostDealCount} deals already lost.`
                : "Patterns build from closed-lost deals. There are none yet to learn from."
            }
          />
        ) : (
          <>
            <MobileCard>
              <CardHeader label="At risk" />
              <p className="m-hero m-num">{deals.length}</p>
              <p className="m-caption m-muted mt-1">
                scored against {data?.lostDealCount ?? 0} past losses
              </p>
            </MobileCard>

            <MobileCard>
              <CardHeader label="Deals" />
              <ul className="space-y-4">
                {deals.map((deal) => (
                  <li key={deal.dealId}>
                    <ListRow
                      href={`/deals/${deal.dealId}/alerts`}
                      title={deal.dealName}
                      sub={deal.accountName}
                      trailing={
                        <span className={cn("m-num", HEALTH_CLASS.RED.text)}>
                          {Math.round(deal.score)}
                        </span>
                      }
                      ariaLabel={`${deal.dealName}, risk score ${Math.round(deal.score)}. Opens Risk alerts.`}
                    />
                    {deal.matchedPatterns.length > 0 ? (
                      <p className="m-caption m-muted truncate">
                        {deal.matchedPatterns
                          .map((p) => `${humanizeCode(p.code)} (${Math.round(p.lethality * 100)}%)`)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </MobileCard>
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

/**
 * How each kind of loss actually played out.
 *
 * The two figures worth having per archetype are gate completion and the share
 * that never passed Gate 2 — together they say whether a loss happened because
 * the technical case was never made, or in spite of it having been.
 */
function Archetypes() {
  const query = useGetAutopsy();
  const archetypes = query.data?.data?.byArchetype ?? [];

  return (
    <PullToRefresh onRefresh={query.refetch}>
      <div className="space-y-3 p-4">
        {query.isError ? (
          <ErrorState
            title="Couldn't load archetypes"
            body="Pull down to try again, or check your connection."
          />
        ) : query.isLoading ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : archetypes.length === 0 ? (
          <EmptyState
            title="No archetypes yet"
            body="An archetype is assigned when a deal is closed lost, so this fills as losses are recorded."
          />
        ) : (
          archetypes.map((archetype) => (
            <MobileCard key={archetype.archetypeId ?? archetype.archetypeName}>
              <CardHeader
                label={archetype.archetypeName}
                action={
                  <span className="m-caption m-muted m-num">
                    {archetype.lossCount} {archetype.lossCount === 1 ? "loss" : "losses"}
                  </span>
                }
              />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Stat
                  label="Avg gate completion"
                  value={`${Math.round(archetype.avgGateCompletionPct)}%`}
                />
                <Stat
                  label="Never passed Gate 2"
                  value={`${Math.round(archetype.neverPassedGate2Share * 100)}%`}
                />
                <Stat
                  label="Services attached"
                  value={`${Math.round(archetype.servicesAttachShare * 100)}%`}
                />
                <Stat
                  label="Value lost"
                  value={compactCurrency(
                    archetype.deals.reduce((sum, d) => sum + d.tcv, 0),
                  )}
                />
              </dl>

              {archetype.patternsThatFired.length > 0 ? (
                <>
                  <p className="m-label m-muted mb-1.5 mt-3">Patterns that fired</p>
                  <ul className="space-y-1.5">
                    {archetype.patternsThatFired.map((pattern) => (
                      <li
                        key={pattern.code}
                        className="m-caption flex items-baseline justify-between gap-3"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {humanizeCode(pattern.code)}
                        </span>
                        <span className="m-muted m-num shrink-0">
                          {Math.round(pattern.share * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {archetype.deals.length > 0 ? (
                <>
                  <p className="m-label m-muted mb-1 mt-3">Deals</p>
                  <ul>
                    {archetype.deals.map((deal) => (
                      <li key={deal.id}>
                        <ListRow
                          href={`/memory/${deal.id}`}
                          title={deal.dealName}
                          sub={deal.accountName}
                          trailing={compactCurrency(deal.tcv)}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </MobileCard>
          ))
        )}
      </div>
    </PullToRefresh>
  );
}

/**
 * Capability gaps: what deals were lost or blocked for the want of.
 *
 * Ranked by lost value rather than by how many deals mention the gap. A gap
 * named on twenty small deals is a nuisance; one named on two large ones is a
 * roadmap argument, and the point of this screen is to be able to make that
 * argument with a figure attached.
 *
 * Open value rides alongside because the two mean different things: lost value
 * is the case for building it, open value is the case for building it SOON.
 */
function ProductGaps() {
  const query = useGetProductGaps();
  const clusters = [...(query.data?.data?.clusters ?? [])].sort(
    (a, b) => b.lostTcv - a.lostTcv,
  );
  const peak = Math.max(...clusters.map((c) => c.lostTcv), 1);

  return (
    <PullToRefresh onRefresh={query.refetch}>
      <div className="space-y-3 p-4">
        {query.isError ? (
          <ErrorState
            title="Couldn't load product gaps"
            body="Pull down to try again, or check your connection."
          />
        ) : query.isLoading ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : clusters.length === 0 ? (
          <EmptyState
            title="No product gaps recorded"
            body="Gaps come from what blocked deals and what lost ones cited. Neither has produced a cluster yet."
          />
        ) : (
          <MobileCard>
            <CardHeader label="By value lost" />
            <ul className="space-y-3">
              {clusters.map((cluster) => (
                <li key={cluster.productId ?? cluster.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="m-headline min-w-0 flex-1 truncate">
                      {cluster.productName ?? cluster.label}
                    </span>
                    <span className="m-caption m-muted m-num shrink-0">
                      {cluster.dealCount} {cluster.dealCount === 1 ? "deal" : "deals"}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-destructive"
                      style={{ width: `${(cluster.lostTcv / peak) * 100}%` }}
                    />
                  </div>
                  <p className="m-caption m-muted mt-1">
                    <span className="m-num">{compactCurrency(cluster.lostTcv)}</span> lost ·{" "}
                    <span className="m-num">{compactCurrency(cluster.openTcv)}</span> still open
                    {cluster.openBlockerCount > 0
                      ? ` · ${cluster.openBlockerCount} open ${cluster.openBlockerCount === 1 ? "blocker" : "blockers"}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </MobileCard>
        )}
      </div>
    </PullToRefresh>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="m-label m-muted truncate">{label}</dt>
      <dd className="m-headline m-num mt-0.5 truncate">{value}</dd>
    </div>
  );
}
