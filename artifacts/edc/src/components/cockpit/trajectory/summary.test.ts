import { describe, expect, it } from "vitest";
import {
  deriveSummary,
  stageDurations,
  toChartRows,
  verdict,
  type TrajectoryPoint,
} from "./summary";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 7, 1);

/** `now` is injected everywhere, so none of these depend on the wall clock. */
const NOW = T0 + 10 * DAY;

function point(dayOffset: number, over: Partial<TrajectoryPoint> = {}): TrajectoryPoint {
  return {
    at: new Date(T0 + dayOffset * DAY).toISOString(),
    score: null,
    gatePct: null,
    health: null,
    stage: null,
    tcv: null,
    playbookPct: null,
    meddpiccPct: null,
    ...over,
  };
}

describe("toChartRows", () => {
  it("sorts ascending and drops unparseable timestamps", () => {
    const rows = toChartRows([
      point(2, { score: 30 }),
      { ...point(0, { score: 10 }), at: "not a date" },
      point(1, { score: 20 }),
    ]);
    expect(rows.map((r) => r.score)).toEqual([20, 30]);
  });
});

describe("deriveSummary", () => {
  it("takes the first NON-NULL value as the baseline, not the first row", () => {
    // The endpoint carries metrics forward across an axis built from two
    // independent series, so a leading null means "not measured yet" — reading
    // it as a zero baseline would invent a rise that never happened.
    const rows = toChartRows([point(0), point(1, { score: 40 }), point(2, { score: 55 })]);
    const summary = deriveSummary(rows, NOW);
    expect(summary.score).toEqual({ first: 40, last: 55 });
  });

  it("ranks health to decide the trend rather than comparing strings", () => {
    const improving = deriveSummary(
      toChartRows([point(0, { health: "RED" }), point(3, { health: "GREEN" })]),
      NOW,
    );
    expect(improving.healthTrend).toBe("improved");

    const worsening = deriveSummary(
      toChartRows([point(0, { health: "GREEN" }), point(3, { health: "YELLOW" })]),
      NOW,
    );
    expect(worsening.healthTrend).toBe("worsened");

    const flat = deriveSummary(
      toChartRows([point(0, { health: "YELLOW" }), point(3, { health: "YELLOW" })]),
      NOW,
    );
    expect(flat.healthTrend).toBe("flat");
  });

  it("spans inclusive days and reports the latest stage", () => {
    const summary = deriveSummary(
      toChartRows([point(0, { stage: "Discovery" }), point(4, { stage: "Validation" })]),
      NOW,
    );
    expect(summary.spanDays).toBe(5);
    expect(summary.stage).toBe("Validation");
  });
});

describe("verdict", () => {
  const at = (rows: TrajectoryPoint[]) => verdict(deriveSummary(toChartRows(rows), NOW));

  it("calls a material score drop Slipping", () => {
    const v = at([point(0, { score: 60, stage: "Commercial" }), point(3, { score: 48 })]);
    expect(v.lead).toBe("Slipping");
    expect(v.tone).toBe("bad");
    expect(v.rest).toContain("12 pts");
  });

  it("calls worsened health Slipping even when the score held", () => {
    const v = at([
      point(0, { score: 60, health: "GREEN", stage: "Validation" }),
      point(3, { score: 60, health: "RED" }),
    ]);
    expect(v.lead).toBe("Slipping");
    expect(v.rest).toContain("health fell");
  });

  it("calls a material score rise Climbing", () => {
    const v = at([point(0, { score: 40, stage: "Validation" }), point(3, { score: 58 })]);
    expect(v.lead).toBe("Climbing");
    expect(v.tone).toBe("good");
    expect(v.rest).toContain("18 pts");
  });

  it("treats movement below the material threshold as Stalling, not a trend", () => {
    const v = at([point(0, { score: 50, stage: "Commercial" }), point(3, { score: 53 })]);
    expect(v.lead).toBe("Stalling");
    expect(v.tone).toBe("warn");
    expect(v.rest).toContain("Commercial");
  });

  it("is deterministic — the same payload always produces the same sentence", () => {
    const rows = [point(0, { score: 40, stage: "Validation" }), point(3, { score: 58 })];
    expect(at(rows)).toEqual(at(rows));
  });
});

describe("stageDurations", () => {
  it("measures the current stage up to now, not to its last snapshot", () => {
    // Discovery ran days 0-2; Commercial started on day 2 and the deal is still
    // in it at NOW (day 10). Measuring Commercial to its last snapshot would
    // report 1 day and hide three weeks of sitting still — the exact signal the
    // list exists to give.
    const rows = toChartRows([
      point(0, { stage: "Discovery" }),
      point(1, { stage: "Discovery" }),
      point(2, { stage: "Commercial" }),
    ]);
    const stages = stageDurations(rows, NOW);
    expect(stages.map((s) => s.stage)).toEqual(["Discovery", "Commercial"]);
    expect(stages[0].days).toBe(3);
    expect(stages[1].days).toBe(9);
    expect(stages[1].isCurrent).toBe(true);
  });

  it("keeps the worst health seen during a run, not the last", () => {
    const rows = toChartRows([
      point(0, { stage: "Validation", health: "GREEN" }),
      point(1, { stage: "Validation", health: "RED" }),
      point(2, { stage: "Validation", health: "GREEN" }),
    ]);
    expect(stageDurations(rows, NOW)[0].health).toBe("RED");
  });

  it("collapses re-entry into separate runs rather than merging them", () => {
    const rows = toChartRows([
      point(0, { stage: "Validation" }),
      point(2, { stage: "Commercial" }),
      point(4, { stage: "Validation" }),
    ]);
    expect(stageDurations(rows, NOW).map((s) => s.stage)).toEqual([
      "Validation",
      "Commercial",
      "Validation",
    ]);
  });

  it("returns nothing when no point carries a stage", () => {
    expect(stageDurations(toChartRows([point(0), point(1)]), NOW)).toEqual([]);
  });
});
