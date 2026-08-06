import { describe, it, expect } from "vitest";
import {
  countOccurrences,
  memorySearchScore,
  memorySnippetText,
  buildSnippet,
  type SearchableMemoryRow,
} from "./memory-search";

function row(overrides: Partial<SearchableMemoryRow> = {}): SearchableMemoryRow {
  return {
    accountName: "Soylent Systems",
    dealName: "Project Delta",
    winLossNarrative: "Lost on integration depth against Rival Corp.",
    keyLessons: ["Engage security earlier", "Bring the integration architect"],
    tags: ["displacement", "security-blocked"],
    ...overrides,
  };
}

describe("countOccurrences", () => {
  it("counts case-insensitively and without overlapping", () => {
    expect(countOccurrences("aaaa", "aa")).toBe(2);
    expect(countOccurrences("Integration integration", "INTEGRATION")).toBe(2);
  });

  it("treats an empty needle as no match rather than infinite matches", () => {
    expect(countOccurrences("anything", "")).toBe(0);
  });
});

describe("memorySearchScore — every field the tsvector indexed", () => {
  // These four are the regression. The first Catalyst port searched only the
  // narrative and key lessons (the ts_headline source), so account name, deal
  // name and tags matched nothing at all — verified live against the deployed
  // app before the fix: "Soylent", "Delta" and a tag all returned 0 rows.
  it("matches on account name (setweight 'A')", () => {
    expect(memorySearchScore(row(), "Soylent")).toBeGreaterThan(0);
  });

  it("matches on deal name (setweight 'A')", () => {
    expect(memorySearchScore(row(), "Delta")).toBeGreaterThan(0);
  });

  it("matches on the win/loss narrative (setweight 'B')", () => {
    expect(memorySearchScore(row(), "Rival Corp")).toBeGreaterThan(0);
  });

  it("matches on key lessons (setweight 'C')", () => {
    expect(memorySearchScore(row(), "security earlier")).toBeGreaterThan(0);
  });

  it("matches on tags (setweight 'D')", () => {
    expect(memorySearchScore(row(), "displacement")).toBeGreaterThan(0);
  });

  it("scores a non-match as zero", () => {
    expect(memorySearchScore(row(), "kubernetes")).toBe(0);
  });

  it("survives a row with every optional field null", () => {
    const bare = row({ winLossNarrative: null, keyLessons: null, tags: null });
    expect(memorySearchScore(bare, "Soylent")).toBeGreaterThan(0);
    expect(memorySearchScore(bare, "integration")).toBe(0);
  });
});

describe("memorySearchScore — weighting", () => {
  const term = "Vertex";

  it("ranks a name hit above a narrative hit", () => {
    const byName = row({ accountName: "Vertex Industries", winLossNarrative: null, keyLessons: null, tags: null });
    const byNarrative = row({ winLossNarrative: "Displaced by Vertex", keyLessons: null, tags: null });
    expect(memorySearchScore(byName, term)).toBeGreaterThan(memorySearchScore(byNarrative, term));
  });

  it("ranks a narrative hit above a lessons hit, and lessons above tags", () => {
    const narrative = row({ winLossNarrative: "Vertex", keyLessons: null, tags: null });
    const lessons = row({ winLossNarrative: null, keyLessons: ["Vertex"], tags: null });
    const tags = row({ winLossNarrative: null, keyLessons: null, tags: ["Vertex"] });
    const s = (r: SearchableMemoryRow) => memorySearchScore(r, term);
    expect(s(narrative)).toBeGreaterThan(s(lessons));
    expect(s(lessons)).toBeGreaterThan(s(tags));
  });

  it("ranks more mentions above fewer within the same field", () => {
    const once = row({ accountName: "A", dealName: "B", winLossNarrative: "Vertex", keyLessons: null, tags: null });
    const twice = row({ accountName: "A", dealName: "B", winLossNarrative: "Vertex then Vertex", keyLessons: null, tags: null });
    expect(memorySearchScore(twice, term)).toBeGreaterThan(memorySearchScore(once, term));
  });
});

describe("snippets", () => {
  it("draws only on narrative + lessons, never names or tags", () => {
    const text = memorySnippetText(row());
    expect(text).toContain("integration depth");
    expect(text).toContain("Engage security earlier");
    expect(text).not.toContain("Soylent");
    expect(text).not.toContain("displacement");
  });

  it("wraps the match in <mark>, matching ts_headline's markup", () => {
    expect(buildSnippet("Lost on integration depth", "integration")).toContain("<mark>integration</mark>");
  });

  it("highlights case-insensitively but preserves the original casing", () => {
    const out = buildSnippet("Lost to Rival Corp", "rival corp");
    expect(out).toContain("<mark>Rival Corp</mark>");
  });

  it("falls back to a leading excerpt when the match was on a name or tag", () => {
    // The row matched via account name, so the snippet source has no hit —
    // ts_headline returns leading context rather than nothing.
    const out = buildSnippet("Lost on integration depth against Rival Corp.", "Soylent");
    expect(out).toBe("Lost on integration depth against Rival Corp.");
    expect(out).not.toContain("<mark>");
  });

  it("returns null when there is nothing to excerpt", () => {
    expect(buildSnippet("", "anything")).toBeNull();
    expect(memorySnippetText(row({ winLossNarrative: null, keyLessons: null }))).toBe("");
  });

  it("ellipsises both ends when the match sits deep inside a long narrative", () => {
    const long = `${"filler ".repeat(40)}NEEDLE${" filler".repeat(40)}`;
    const out = buildSnippet(long, "NEEDLE")!;
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("<mark>NEEDLE</mark>");
  });
});
