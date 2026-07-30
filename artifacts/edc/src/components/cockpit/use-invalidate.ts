import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDealQueryKey,
  getGetDealIntelligenceQueryKey,
  getListGatesQueryKey,
  getListBlockersQueryKey,
  getListCrossSellsQueryKey,
  getListAuditQueryKey,
  getListDealCompetitorsQueryKey,
} from "@workspace/api-client-react";

export function useCockpitInvalidate(dealId: string) {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getGetDealQueryKey(dealId) }),
      qc.invalidateQueries({ queryKey: getGetDealIntelligenceQueryKey(dealId) }),
      qc.invalidateQueries({ queryKey: getListGatesQueryKey(dealId) }),
      qc.invalidateQueries({ queryKey: getListBlockersQueryKey(dealId) }),
      qc.invalidateQueries({ queryKey: getListCrossSellsQueryKey(dealId) }),
      // No-params key, so this prefix-matches the History panel's
      // useListAudit(dealId, { limit: 200 }) too. /changes is no longer read by
      // any component, so its key is not invalidated here any more.
      qc.invalidateQueries({ queryKey: getListAuditQueryKey(dealId) }),
      // The New Deal / Edit Deal "Incumbent / Competitor" field auto-seeds the
      // Competitive Landscape (see seedIncumbentCompetitor in routes/deals.ts) —
      // invalidate its list so an incumbent change reflects there immediately.
      qc.invalidateQueries({ queryKey: getListDealCompetitorsQueryKey(dealId) }),
    ]);
  };
}

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
