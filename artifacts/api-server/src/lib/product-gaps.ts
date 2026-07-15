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
  lostTcv: number;
  openBlockerCount: number;
  deals: GapDeal[];
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

interface Acc {
  label: string;
  norm: string;
  autopsyDeals: Map<string, GapDeal>;
  blockerDeals: Map<string, GapDeal>;
  lostTcv: number;
}

// A catalog product matches a gap label when either name contains the other
// (case-insensitive) — a deliberately loose mapping; unmatched clusters keep
// productId null.
function mapProduct(labelNorm: string, catalog: CatalogEntry[]): CatalogEntry | null {
  for (const c of catalog) {
    const pn = normalize(c.productName);
    if (pn && (pn.includes(labelNorm) || labelNorm.includes(pn))) return c;
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
        { label: raw.trim(), norm, autopsyDeals: new Map(), blockerDeals: new Map(), lostTcv: 0 };
      if (!acc.autopsyDeals.has(m.dealId)) {
        acc.autopsyDeals.set(m.dealId, { dealId: m.dealId, dealName: m.dealName, source: "autopsy", tcv: m.finalTcv });
        acc.lostTcv += m.finalTcv ?? 0;
      }
      clusters.set(norm, acc);
    }
  }

  // Secondary: fold unresolved technical blockers into existing clusters by
  // token containment (blockers don't form clusters on their own — too noisy).
  for (const b of blockers) {
    const desc = normalize(b.description);
    if (!desc) continue;
    for (const acc of clusters.values()) {
      if (desc.includes(acc.norm) || acc.norm.includes(desc)) {
        if (!acc.blockerDeals.has(b.dealId)) {
          acc.blockerDeals.set(b.dealId, { dealId: b.dealId, dealName: b.dealName, source: "blocker", tcv: b.tcv });
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
      openBlockerCount: acc.blockerDeals.size,
      deals,
    };
  });

  result.sort((a, b) => b.lostTcv - a.lostTcv || b.dealCount - a.dealCount);
  return result;
}
