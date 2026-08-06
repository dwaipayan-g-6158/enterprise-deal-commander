/**
 * Deal-memory full-text search, as a pure function of the rows.
 *
 * Postgres did this with a `searchable_vector` tsvector column plus
 * `ts_rank`/`ts_headline` (lib/db/sql/deal_memory_searchable_vector.sql).
 * Catalyst Data Store has no equivalent, and Catalyst Search cannot stand in:
 * its `search_index_enabled` flag is not offered for `text` columns at all,
 * and `win_loss_narrative` is exactly such a column (docs/CATALYST_SCHEMA.md).
 * So the match runs in memory — fine here, because every row is already
 * fetched for the JS-side facet filters that share the endpoint.
 *
 * This lives outside routes/v2/crud.ts and takes a structural row type so it
 * can be unit-tested without Data Store, the same reason lib/portfolio-analysis.ts
 * exists. The regression it guards against is subtle enough to deserve tests:
 * the first Catalyst port searched only `win_loss_narrative` + `key_lessons`,
 * which are the fields `ts_headline` built the SNIPPET from, not the fields the
 * INDEX covered. Account name, deal name and tags silently stopped matching —
 * so searching an account name, about the most natural query this feature has,
 * returned nothing where Postgres ranked it top.
 */

/** Only the fields search reads — any deal-memory row shape satisfies this. */
export interface SearchableMemoryRow {
  accountName: string;
  dealName: string;
  winLossNarrative: string | null;
  keyLessons: string[] | null;
  tags: string[] | null;
}

/**
 * The fields `setweight` labelled A/B/C/D in the tsvector, scored with
 * ts_rank's default weights for those labels. Keep this list in sync with
 * deal_memory_searchable_vector.sql if that ever changes.
 */
const SEARCH_FIELDS: ReadonlyArray<{
  weight: number;
  text: (r: SearchableMemoryRow) => string;
}> = [
  { weight: 1.0, text: (r) => `${r.accountName} ${r.dealName}` },
  { weight: 0.4, text: (r) => r.winLossNarrative ?? "" },
  { weight: 0.2, text: (r) => (r.keyLessons ?? []).join(" ") },
  { weight: 0.1, text: (r) => (r.tags ?? []).join(" ") },
];

/** Non-overlapping, case-insensitive occurrences of `needle` in `haystack`. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const hay = haystack.toLowerCase();
  const target = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = hay.indexOf(target, idx)) !== -1) {
    count += 1;
    idx += target.length;
  }
  return count;
}

/**
 * Weighted match count across every indexed field; 0 means "no match".
 * Not literally ts_rank (which normalises by document length and term
 * frequency), but it preserves the two properties that are observable in the
 * UI: a row matching a higher-weighted field outranks one matching a lower,
 * and more mentions outrank fewer.
 */
export function memorySearchScore(row: SearchableMemoryRow, term: string): number {
  let score = 0;
  for (const field of SEARCH_FIELDS) {
    score += field.weight * countOccurrences(field.text(row), term);
  }
  return score;
}

/** The text `ts_headline` ran on — narrative + lessons, NOT names or tags. */
export function memorySnippetText(row: SearchableMemoryRow): string {
  return `${row.winLossNarrative ?? ""} ${(row.keyLessons ?? []).join(" ")}`.trim();
}

/**
 * A short excerpt around the first match, using ts_headline's
 * `StartSel=<mark>,StopSel=</mark>` markup so the existing frontend rendering
 * (components/memory/memory-result-card.tsx) needs no changes.
 *
 * A row can match on account/deal name or tags while the snippet source holds
 * no match at all. ts_headline covers that by returning the LEADING text of
 * the source unhighlighted rather than nothing, so the card still gets
 * context; this does the same.
 */
export function buildSnippet(text: string, term: string): string | null {
  if (!text) return null;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) {
    const lead = text.slice(0, 180);
    return lead.length < text.length ? `${lead}…` : lead;
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + term.length + 120);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const before = text.slice(start, idx);
  const match = text.slice(idx, idx + term.length);
  const after = text.slice(idx + term.length, end);
  return `${prefix}${before}<mark>${match}</mark>${after}${suffix}`;
}
