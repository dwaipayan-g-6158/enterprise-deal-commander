import { describe, it, expect } from "vitest";
import {
  QUESTION_CATALOG,
  computeMeddpiccScore,
  stageBucketForStageName,
  DEFAULT_MEDDPICC_THRESHOLDS,
  type MeddpiccQuestion,
} from "./meddpicc";

describe("MEDDPICC question catalog", () => {
  it("has exactly 8 questions", () => {
    expect(QUESTION_CATALOG).toHaveLength(8);
  });

  it("has unique, sequential questionOrder values 1-8", () => {
    const orders = QUESTION_CATALOG.map((q) => q.questionOrder).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 8 }, (_, i) => i + 1));
  });

  it("stage-tag counts: 5 Q, 2 P, 1 N", () => {
    const byTag = (tag: string) => QUESTION_CATALOG.filter((q) => q.stageTag === tag).length;
    expect(byTag("Q")).toBe(5);
    expect(byTag("P")).toBe(2);
    expect(byTag("N")).toBe(1);
  });

  it("pillar max points sum to 24 (8 pillars x 3)", () => {
    const maxByPillar = new Map<string, number>();
    for (const q of QUESTION_CATALOG as MeddpiccQuestion[]) {
      maxByPillar.set(q.pillar, (maxByPillar.get(q.pillar) ?? 0) + 3);
    }
    expect(maxByPillar.size).toBe(8);
    const total = [...maxByPillar.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(24);
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
    expect(r.unknownCount).toBe(8);
    expect(r.strongNoCount).toBe(0);
  });

  it("scores 100% overall and Green when every question is a Strong Yes (3)", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG) answers[q.questionOrder] = 3;
    const r = computeMeddpiccScore(answers, "Negotiation");
    expect(r.overallScore).toBe(24);
    expect(r.overallPct).toBe(100);
    expect(r.ragStatus).toBe("Green");
    expect(r.unknownCount).toBe(0);
  });

  it("Metrics pillar max is 3 (1 question) and reflects partial answers", () => {
    const r = computeMeddpiccScore({ 1: 2 }, "Negotiation");
    const metrics = r.pillarBreakdown.find((p) => p.pillar === "Metrics");
    expect(metrics).toEqual({ pillar: "Metrics", raw: 2, max: 3, pct: 67 });
  });

  it("stagePct only counts Q-tagged questions (1,3,4,6,8) in the Qualification bucket", () => {
    const answers: Record<number, number> = { 1: 3, 3: 3, 4: 3, 6: 3, 8: 3 };
    const r = computeMeddpiccScore(answers, "Qualification");
    expect(r.stagePct).toBe(100); // all 5 Q-tagged questions maxed (15/15)
    expect(r.overallPct).toBeLessThan(100); // P/N questions (2,5,7) still unanswered
  });

  it("RAG boundaries: <40 Red, 40-75 inclusive Amber, >75 Green", () => {
    const at = (pct: number) => {
      const score = Math.round((pct / 100) * 24);
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
    expect(at(79)).toBe("Green");
  });

  it("respects custom thresholds", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG) answers[q.questionOrder] = 2; // 66.7%
    const r = computeMeddpiccScore(answers, "Negotiation", { redMax: 70, greenMin: 90 });
    expect(r.ragStatus).toBe("Red");
  });

  it("counts explicit Strong-No (1) and Unknown (0/unanswered) separately", () => {
    const r = computeMeddpiccScore({ 1: 1, 2: 0 }, "Negotiation");
    expect(r.strongNoCount).toBe(1);
    expect(r.unknownCount).toBe(7); // 6 unanswered + question 2 explicitly rated 0
  });
});
