import { useMemo } from "react";
import {
  useGetDealIntelligence,
  useGetDealScore,
  useGetDealTags,
  useGetRosterEnrichment,
  type DealScore,
  type Intelligence,
  type Tag,
} from "@workspace/api-client-react";
import type { RosterEnrichment } from "@/components/roster/model/roster-types";

export interface DealBriefData {
  intel: Intelligence | undefined;
  score: DealScore | undefined;
  tags: Tag[];
  enrichment: RosterEnrichment | undefined;
  isError: boolean;
  isLoading: boolean;
  refresh: () => Promise<unknown>;
}

/**
 * What the Brief loads. Four reads, and the count is the point.
 *
 * The screen this replaces issued six — adding the playbook journey, the
 * trajectory and twenty activity rows for three sections a reader had to scroll
 * past two screens of content to reach. Those now load on their own pushed
 * screens, when someone actually asks for them, which is the single biggest
 * perceived-speed win in this rebuild.
 *
 * `useGetRosterEnrichment` is portfolio-wide and almost always warm: it is the
 * same query the Deals list issues, and the Brief is usually reached by tapping
 * a card in that list. It supplies the stage benchmark, which the Brief's
 * verdict needs to call a deal stalled on the same line the card does.
 */
export function useDealBrief(dealId: string): DealBriefData {
  const intelQuery = useGetDealIntelligence(dealId);
  const scoreQuery = useGetDealScore(dealId);
  const tagsQuery = useGetDealTags(dealId);
  const enrichQuery = useGetRosterEnrichment();

  const enrichment = useMemo(() => {
    const list = (enrichQuery.data?.data as { deals?: RosterEnrichment[] } | undefined)?.deals ?? [];
    return list.find((d) => d.id === dealId);
  }, [enrichQuery.data, dealId]);

  const refresh = () =>
    Promise.all([
      intelQuery.refetch(),
      scoreQuery.refetch(),
      tagsQuery.refetch(),
      enrichQuery.refetch(),
    ]);

  return {
    intel: intelQuery.data?.data,
    score: scoreQuery.data?.data,
    tags: tagsQuery.data?.data ?? [],
    enrichment,
    // Only intelligence failing is fatal: it carries the identity, the money and
    // the alerts. A missing score costs one line; a missing tag list costs a row
    // of chips.
    isError: intelQuery.isError,
    isLoading: intelQuery.isLoading,
    refresh,
  };
}
