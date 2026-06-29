import {
  getGetDealIntelligenceQueryKey,
  getGetDealQueryKey,
  useGetDeal,
  useGetDealIntelligence,
} from "@workspace/api-client-react";

// Lazy per-deal fetch backing the preview panel. Gated by `enabled` so the list
// view itself never triggers per-row requests; staleTime keeps reopening a
// recently-viewed deal a cache hit (no refetch).
export function useDealPreview(dealId: string | null) {
  const enabled = !!dealId;
  const id = dealId ?? "";

  // staleTime keeps a reopened/re-expanded deal a true cache hit (no background
  // refetch) within the window, so rapidly browsing rows never storms the API.
  const STALE = 60_000;
  const dealQuery = useGetDeal(id, {
    query: { enabled, queryKey: getGetDealQueryKey(id), staleTime: STALE },
  });
  const intelQuery = useGetDealIntelligence(id, {
    query: { enabled, queryKey: getGetDealIntelligenceQueryKey(id), staleTime: STALE },
  });

  return {
    deal: dealQuery.data?.data,
    intelligence: intelQuery.data?.data,
    isLoading: enabled && (dealQuery.isLoading || intelQuery.isLoading),
    isError: dealQuery.isError,
  };
}
