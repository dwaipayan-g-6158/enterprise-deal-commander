// Pure product-gap clustering: aggregate the free-text product gaps captured in
// loss autopsies (deal_memory.product_gaps) across Lost deals, augmented by
// unresolved technical blockers, into clusters with TCV-at-risk. DB-free so it
// unit-tests headless. The route supplies the rows + catalog.

export interface GapMemory {
  dealId: string;
  dealName: string;
  finalTcv: number | null;
  productGaps: string[];
}

export interface GapBlocker {
  dealId: string;
  dealName: string;
  description: string;
  tcv: number | null;
}

export interface CatalogEntry {
  id: string;
  productName: string;
  code: string;
}

export interface GapDeal {
  dealId: string;
  dealName: string;
  source: "autopsy" | "blocker";
  tcv: number | null;
}

export interface GapCluster {
  label: string;
  productId: string | null;
  productName: string | null;
  dealCount: number;
  /** TCV at risk from Closed-Lost autopsy deals citing this gap. */
  lostTcv: number;
  /** TCV on still-OPEN deals blocked by this gap (not yet lost, so not "at risk" in the same sense as lostTcv). */
  openTcv: number;
  openBlockerCount: number;
  deals: GapDeal[];
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Below this length a raw substring match is too generic to trust — e.g. a
// 3-char label like "sso" or "api" used to match ANY string that merely
// contained those letters in sequence (including mid-word, like "sso" inside
// "glossolalia"), pulling unrelated deals/blockers into the same cluster.
// Rather than special-case short strings, matching simply doesn't attempt
// them — a deliberate precision-over-recall tradeoff at this data volume,
// consistent with this file's other "false precision is worse" choices.
const MIN_MATCH_LENGTH = 4;

/** Whole-word/phrase containment: `needle` must appear in `haystack` bounded
 *  by non-word characters (or string edges) on both sides, not merely as a
 *  contiguous substring — so "sso" no longer matches inside "glossolalia",
 *  while "log360 scale" still matches "log360 scale ceiling at 5k eps". */
function boundedIncludes(haystack: string, needle: string): boolean {
  if (needle.length < MIN_MATCH_LENGTH) return false;
  return new RegExp(`\\b${escapeRegex(needle)}\\b`).test(haystack);
}

interface Acc {
  label: string;
  norm: string;
  autopsyDeals: Map<string, GapDeal>;
  blockerDeals: Map<string, GapDeal>;
  lostTcv: number;
  openTcv: number;
}

// A catalog product matches a gap label when either name contains the other
// as a bounded whole word/phrase (case-insensitive) — a deliberately loose
// mapping; unmatched clusters keep productId null.
function mapProduct(labelNorm: string, catalog: CatalogEntry[]): CatalogEntry | null {
  for (const c of catalog) {
    const pn = normalize(c.productName);
    if (!pn) continue;
    if (boundedIncludes(pn, labelNorm) || boundedIncludes(labelNorm, pn)) return c;
  }
  return null;
}

export function clusterProductGaps(
  memories: GapMemory[],
  blockers: GapBlocker[],
  catalog: CatalogEntry[],
): GapCluster[] {
  const clusters = new Map<string, Acc>();

  // Primary: autopsy product gaps.
  for (const m of memories) {
    for (const raw of m.productGaps ?? []) {
      const norm = normalize(raw);
      if (!norm) continue;
      const acc =
        clusters.get(norm) ??
        { label: raw.trim(), norm, autopsyDeals: new Map(), blockerDeals: new Map(), lostTcv: 0, openTcv: 0 };
      if (!acc.autopsyDeals.has(m.dealId)) {
        acc.autopsyDeals.set(m.dealId, { dealId: m.dealId, dealName: m.dealName, source: "autopsy", tcv: m.finalTcv });
        acc.lostTcv += m.finalTcv ?? 0;
      }
      clusters.set(norm, acc);
    }
  }

  // Secondary: fold unresolved technical blockers into existing clusters by
  // bounded phrase containment (blockers don't form clusters on their own —
  // too noisy).
  for (const b of blockers) {
    const desc = normalize(b.description);
    if (!desc) continue;
    for (const acc of clusters.values()) {
      if (boundedIncludes(desc, acc.norm) || boundedIncludes(acc.norm, desc)) {
        if (!acc.blockerDeals.has(b.dealId)) {
          acc.blockerDeals.set(b.dealId, { dealId: b.dealId, dealName: b.dealName, source: "blocker", tcv: b.tcv });
          acc.openTcv += b.tcv ?? 0;
        }
      }
    }
  }

  const result: GapCluster[] = [...clusters.values()].map((acc) => {
    const product = mapProduct(acc.norm, catalog);
    const deals = [...acc.autopsyDeals.values(), ...acc.blockerDeals.values()];
    const distinct = new Set(deals.map((d) => d.dealId));
    return {
      label: acc.label,
      productId: product?.id ?? null,
      productName: product?.productName ?? null,
      dealCount: distinct.size,
      lostTcv: acc.lostTcv,
      openTcv: acc.openTcv,
      openBlockerCount: acc.blockerDeals.size,
      deals,
    };
  });

  result.sort((a, b) => b.lostTcv - a.lostTcv || b.dealCount - a.dealCount);
  return result;
}
