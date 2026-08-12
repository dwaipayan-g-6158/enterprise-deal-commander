import { useMemo } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  getListDealsQueryKey,
  useGetRosterEnrichment,
  useListDeals,
} from "@workspace/api-client-react";
import { deriveVelocityBucket } from "../model/velocity";
import type { Deal, DealState, RosterEnrichment, RosterRow } from "../model/roster-types";

// The list view issues exactly two calls: the active deal set (state + search
// are the only server-side filters) and the roster enrichment. They are merged
// by id and each row gets its client-derived velocity bucket. Everything else
// (filter/sort/group) happens client-side over `rows`.
export function useRosterData(params: { state: DealState; search: string }) {
  const trimmed = params.search.trim();
  const dealParams = { state: params.state, limit: 500, ...(trimmed ? { search: trimmed } : {}) };

  const dealsQuery = useListDeals(dealParams, {
    // Opt this query into focus refetch (the global default is off); Phase 8
    // layers a visible-tab interval on top.
    //
    // keepPreviousData, or every settled keystroke is a brand-new query key, and
    // a brand-new key means isLoading — which tears the list down to shimmer
    // between each character, blanks the nav subtitle, and can flash "No
    // matches" for a half-typed term. Same fix, and the same reason, as
    // mobile/screens/memory/memory-screen.tsx.
    //
    // Desktop shares this hook and already renders "· updating…" gated on
    // isFetching (pages/deals.tsx). That hint never fired during a search
    // before, because the list was torn down instead; this is what makes it work
    // as written.
    query: {
      refetchOnWindowFocus: true,
      queryKey: getListDealsQueryKey(dealParams),
      placeholderData: keepPreviousData,
    },
  });
  const enrichQuery = useGetRosterEnrichment();

  const rows: RosterRow[] = useMemo(() => {
    const deals = dealsQuery.data?.data ?? [];
    const enrichList =
      (enrichQuery.data?.data as { deals?: RosterEnrichment[] } | undefined)?.deals ?? [];
    const byId = new Map(enrichList.map((e) => [e.id, e]));
    return deals.map((d) => {
      const e = byId.get(d.id);
      const withMatch = d as Deal & { matchedIn?: string[] };
      return {
        ...d,
        score: e?.score ?? null,
        scoreDelta: e?.scoreDelta ?? null,
        gatesPct: e?.gatesPct ?? 0,
        daysInStage: e?.daysInStage ?? null,
        daysSinceLastActivity: e?.daysSinceLastActivity ?? null,
        benchmarkDays: e?.benchmarkDays ?? null,
        deltaDays: e?.deltaDays ?? null,
        riskScore: e?.riskScore ?? null,
        riskLevel: e?.riskLevel ?? null,
        velocity: deriveVelocityBucket(e),
        matchedIn: withMatch.matchedIn,
      } satisfies RosterRow;
    });
  }, [dealsQuery.data, enrichQuery.data]);

  return {
    rows,
    total: dealsQuery.data?.meta?.total ?? rows.length,
    // Both queries, not just the deals one. Every enrichment-derived field falls
    // back to null above, so a slow or failed enrichment produced rows that
    // looked complete but had no score, no daysInStage and NO_DATE velocity —
    // and any view filtering on those rendered an empty list with no spinner and
    // no error, which reads as "you have no deals like that" rather than "this
    // hasn't loaded".
    isLoading: dealsQuery.isLoading || enrichQuery.isLoading,
    isError: dealsQuery.isError || enrichQuery.isError,
    isFetching: dealsQuery.isFetching || enrichQuery.isFetching,
    // Retries both, now that a failure in either surfaces as isError — a
    // pull-to-refresh that only retried the half that was already fine would
    // leave the error state on screen with no way out.
    refetch: () => Promise.all([dealsQuery.refetch(), enrichQuery.refetch()]),
  };
}
