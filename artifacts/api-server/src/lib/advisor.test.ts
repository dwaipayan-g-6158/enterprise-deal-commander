import { describe, it, expect } from "vitest";
import { classifyAdvisorIntent } from "./advisor";

const COMPETITORS = ["CloudBridge", "DataVault"];

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
});
