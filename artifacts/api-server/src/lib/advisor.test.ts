import { describe, it, expect } from "vitest";
import { classifyAdvisorIntent, withLowSampleCaveat } from "./advisor";

const COMPETITORS = ["CloudBridge", "DataVault", "Quest"];

describe("classifyAdvisorIntent", () => {
  it("detects a competitive question naming a known competitor", () => {
    const intent = classifyAdvisorIntent("How have we done against CloudBridge?", COMPETITORS);
    expect(intent.type).toBe("competitive");
    if (intent.type !== "competitive") throw new Error("expected competitive intent");
    expect(intent.competitor).toBe("CloudBridge");
  });

  it("detects a pricing question", () => {
    const intent = classifyAdvisorIntent("What discount is typical for enterprise deals?", COMPETITORS);
    expect(intent.type).toBe("pricing");
  });

  it("detects a biggest-deal precedent question", () => {
    const intent = classifyAdvisorIntent("What's the biggest deal we've closed?", COMPETITORS);
    expect(intent.type).toBe("biggest");
  });

  it("falls back to full-text search for anything unmatched", () => {
    const intent = classifyAdvisorIntent("healthcare data migration concerns", COMPETITORS);
    expect(intent.type).toBe("fulltext");
  });

  it("does not classify as competitive when no known competitor is named", () => {
    const intent = classifyAdvisorIntent("How have we done against unnamed rivals?", COMPETITORS);
    expect(intent.type).not.toBe("competitive");
  });

  it("does not match a competitor name as a substring of another word", () => {
    // "Quest" is a substring of "question" — a plain includes() would misfire here.
    const intent = classifyAdvisorIntent("I have a question about our win rate", COMPETITORS);
    expect(intent.type).not.toBe("competitive");
  });

  it("still matches a competitor whose name contains a space", () => {
    const intent = classifyAdvisorIntent("How have we fared against Quest?", COMPETITORS);
    expect(intent.type).toBe("competitive");
    if (intent.type !== "competitive") throw new Error("expected competitive intent");
    expect(intent.competitor).toBe("Quest");
  });
});

describe("withLowSampleCaveat", () => {
  it("forces low confidence and appends a sample-size caveat", () => {
    const base = { answer: "Win rate is 50%.", confidence: "medium" as const, citations: [{ id: "1", dealName: "D", accountName: "A" }] };
    const result = withLowSampleCaveat(base, 2);
    expect(result.confidence).toBe("low");
    expect(result.citations).toEqual(base.citations);
    expect(result.answer).toContain("only 2 archived deals");
  });

  it("uses singular phrasing for a sample of one", () => {
    const base = { answer: "Win rate is 100%.", confidence: "medium" as const, citations: [] };
    const result = withLowSampleCaveat(base, 1);
    expect(result.answer).toContain("only 1 archived deal.");
  });
});
