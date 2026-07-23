import { describe, it, expect } from "vitest";
import {
  QUESTION_CATALOG,
  computeMeddpiccScore,
  stageBucketForStageName,
  DEFAULT_MEDDPICC_THRESHOLDS,
  type MeddpiccQuestion,
} from "./meddpicc";

describe("MEDDPICC question catalog", () => {
  it("has exactly 43 questions", () => {
    expect(QUESTION_CATALOG).toHaveLength(43);
  });

  it("has unique, sequential questionOrder values 1-43", () => {
    const orders = QUESTION_CATALOG.map((q) => q.questionOrder).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 43 }, (_, i) => i + 1));
  });

  it("stage-tag counts match the source template (27 Q, 9 P, 7 N)", () => {
    const byTag = (tag: string) => QUESTION_CATALOG.filter((q) => q.stageTag === tag).length;
    expect(byTag("Q")).toBe(27);
    expect(byTag("P")).toBe(9);
    expect(byTag("N")).toBe(7);
  });

  it("pillar max points sum to 129", () => {
    const maxByPillar = new Map<string, number>();
    for (const q of QUESTION_CATALOG as MeddpiccQuestion[]) {
      maxByPillar.set(q.pillar, (maxByPillar.get(q.pillar) ?? 0) + 3);
    }
    const total = [...maxByPillar.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(129);
  });
});

describe("stageBucketForStageName", () => {
  it("maps Discovery to Qualification", () => {
    expect(stageBucketForStageName("Discovery")).toBe("Qualification");
  });
  it("maps Validation and Commercial to Proposition", () => {
    expect(stageBucketForStageName("Validation")).toBe("Proposition");
    expect(stageBucketForStageName("Commercial")).toBe("Proposition");
  });
  it("maps Procurement and Closed-Won to Negotiation", () => {
    expect(stageBucketForStageName("Procurement")).toBe("Negotiation");
    expect(stageBucketForStageName("Closed-Won")).toBe("Negotiation");
  });
  it("defaults unknown stage names to Negotiation (full model, safest default)", () => {
    expect(stageBucketForStageName("Some Future Stage")).toBe("Negotiation");
  });
});

describe("computeMeddpiccScore", () => {
  it("scores 0% overall and Red when nothing is answered", () => {
    const r = computeMeddpiccScore({}, "Negotiation");
    expect(r.overallScore).toBe(0);
    expect(r.overallPct).toBe(0);
    expect(r.ragStatus).toBe("Red");
    expect(r.pillarBreakdown).toHaveLength(8);
    expect(r.unknownCount).toBe(43);
    expect(r.strongNoCount).toBe(0);
  });

  it("scores 100% overall and Green when every question is a Strong Yes (3)", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG) answers[q.questionOrder] = 3;
    const r = computeMeddpiccScore(answers, "Negotiation");
    expect(r.overallScore).toBe(129);
    expect(r.overallPct).toBe(100);
    expect(r.ragStatus).toBe("Green");
    expect(r.unknownCount).toBe(0);
  });

  it("Metrics pillar max is 15 (5 questions x 3) and reflects partial answers", () => {
    const answers: Record<number, number> = { 1: 3, 2: 3, 3: 0, 4: 0, 5: 0 };
    const r = computeMeddpiccScore(answers, "Negotiation");
    const metrics = r.pillarBreakdown.find((p) => p.pillar === "Metrics");
    expect(metrics).toEqual({ pillar: "Metrics", raw: 6, max: 15, pct: 40 });
  });

  it("stagePct only counts Q-tagged questions in the Qualification bucket", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG.filter((q) => q.stageTag === "Q")) {
      answers[q.questionOrder] = 3;
    }
    const r = computeMeddpiccScore(answers, "Qualification");
    expect(r.stagePct).toBe(100); // all 27 Q-tagged questions maxed
    expect(r.overallPct).toBeLessThan(100); // P/N questions still unanswered
  });

  it("RAG boundaries: <40 Red, 40-75 inclusive Amber, >75 Green", () => {
    const at = (pct: number) => {
      const score = Math.round((pct / 100) * 129);
      const answers: Record<number, number> = {};
      let remaining = score;
      for (const q of QUESTION_CATALOG) {
        const v = Math.min(3, remaining);
        answers[q.questionOrder] = v;
        remaining -= v;
      }
      return computeMeddpiccScore(answers, "Negotiation").ragStatus;
    };
    expect(at(39)).toBe("Red");
    expect(at(40)).toBe("Amber");
    expect(at(75)).toBe("Amber");
    expect(at(76)).toBe("Green");
  });

  it("respects custom thresholds", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG) answers[q.questionOrder] = 2; // 66.7%
    const r = computeMeddpiccScore(answers, "Negotiation", { redMax: 70, greenMin: 90 });
    expect(r.ragStatus).toBe("Red");
  });

  it("counts explicit Strong-No (1) and Unknown (0/unanswered) separately", () => {
    const r = computeMeddpiccScore({ 1: 1, 2: 0, 3: 1 }, "Negotiation");
    expect(r.strongNoCount).toBe(2);
    expect(r.unknownCount).toBe(41); // 40 unanswered + question 2 explicitly rated 0
  });
});
