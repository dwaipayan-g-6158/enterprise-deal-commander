export type AdvisorIntent =
  | { type: "competitive"; competitor: string }
  | { type: "pricing" }
  | { type: "biggest" }
  | { type: "fulltext" };

const COMPETITIVE_PATTERN = /\b(vs\.?|against|beat|lose to|losing to|lost to|win rate)\b/i;
const PRICING_PATTERN = /\b(price|pricing|discount|typical cost|how much)\b/i;
const BIGGEST_PATTERN = /\b(biggest|largest)\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary match, not substring — a plain `includes()` would classify
// "any question about security" as competitive-vs-"Quest".
function matchesCompetitor(lowerQuery: string, competitor: string): boolean {
  return new RegExp(`\\b${escapeRegExp(competitor.toLowerCase())}\\b`).test(lowerQuery);
}

export function classifyAdvisorIntent(query: string, knownCompetitors: string[]): AdvisorIntent {
  const lower = query.toLowerCase();

  if (COMPETITIVE_PATTERN.test(lower)) {
    const matched = knownCompetitors.find((c) => matchesCompetitor(lower, c));
    if (matched) return { type: "competitive", competitor: matched };
  }
  if (PRICING_PATTERN.test(lower)) return { type: "pricing" };
  if (BIGGEST_PATTERN.test(lower)) return { type: "biggest" };
  return { type: "fulltext" };
}

export interface AdvisorCitation { id: string; dealName: string; accountName: string }
export interface AdvisorAnswer {
  answer: string;
  confidence: "high" | "medium" | "low" | "none";
  citations: AdvisorCitation[];
}

export function confidenceFor(citationCount: number): AdvisorAnswer["confidence"] {
  if (citationCount === 0) return "none";
  if (citationCount >= 3) return "high";
  if (citationCount >= 1) return "medium";
  return "low";
}

// This deliberately never fabricates a synthesized narrative — it composes an
// answer from real aggregate numbers and cites every source deal, per the "decline
// to answer rather than speculate" requirement (source PRD FR-6.6.1.6). There is no
// LLM in this app; this is the honest deterministic substitute.
export function composeNoDataAnswer(): AdvisorAnswer {
  return { answer: "I don't have enough archived deal data to answer that yet.", confidence: "none", citations: [] };
}

// A sample under the confidence floor is still real data — surface it with a
// caveat rather than refusing outright, so a young archive isn't silently mute.
export function withLowSampleCaveat(answer: AdvisorAnswer, sampleSize: number): AdvisorAnswer {
  return {
    ...answer,
    answer: `${answer.answer} Treat this as directional — it's based on only ${sampleSize} archived deal${sampleSize === 1 ? "" : "s"}.`,
    confidence: "low",
  };
}
