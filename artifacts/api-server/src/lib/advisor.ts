export type AdvisorIntent =
  | { type: "competitive"; competitor: string }
  | { type: "pricing" }
  | { type: "biggest" }
  | { type: "fulltext" };

const COMPETITIVE_PATTERN = /\b(vs\.?|against|beat|lose to|losing to|lost to|win rate)\b/i;
const PRICING_PATTERN = /\b(price|pricing|discount|typical cost|how much)\b/i;
const BIGGEST_PATTERN = /\b(biggest|largest)\b/i;

export function classifyAdvisorIntent(query: string, knownCompetitors: string[]): AdvisorIntent {
  const lower = query.toLowerCase();

  if (COMPETITIVE_PATTERN.test(lower)) {
    const matched = knownCompetitors.find((c) => lower.includes(c.toLowerCase()));
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
