import { useMemo } from "react";
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
    query: { refetchOnWindowFocus: true, queryKey: getListDealsQueryKey(dealParams) },
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
    isLoading: dealsQuery.isLoading,
    isError: dealsQuery.isError,
    isFetching: dealsQuery.isFetching || enrichQuery.isFetching,
    refetch: dealsQuery.refetch,
  };
}
