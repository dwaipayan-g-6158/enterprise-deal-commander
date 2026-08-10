import { describe, expect, it } from "vitest";
import {
  patchAlertDisposition,
  patchGateList,
  patchIntelligenceGates,
  patchPlaybookStep,
  unpatchAlertDisposition,
} from "./optimistic";

/**
 * The property every one of these shares — returning the input BY REFERENCE when
 * nothing matched — is not an optimization. `setQueriesData` fans out across
 * every cached variant of a key, so a fresh object for an untouched variant
 * re-renders every list in the app on every tap.
 */

describe("patchGateList", () => {
  const cache = () => ({
    data: [
      { gateCode: "SEC", isCompleted: false },
      { gateCode: "PERF", isCompleted: true },
    ],
  });

  it("flips only the named gate", () => {
    const out = patchGateList(cache(), "SEC", true) as ReturnType<typeof cache>;
    expect(out.data[0].isCompleted).toBe(true);
    expect(out.data[1].isCompleted).toBe(true);
  });

  it("returns the same reference when the gate is absent or already correct", () => {
    const input = cache();
    expect(patchGateList(input, "NOPE", true)).toBe(input);
    expect(patchGateList(input, "PERF", true)).toBe(input);
  });

  it("passes through anything that is not a gate list", () => {
    expect(patchGateList(undefined, "SEC", true)).toBeUndefined();
    expect(patchGateList({ data: "nope" }, "SEC", true)).toEqual({ data: "nope" });
  });
});

describe("patchIntelligenceGates", () => {
  const cache = () => ({
    data: {
      technicalTrack: {
        gates: [
          { gateCode: "A", isCompleted: true },
          { gateCode: "B", isCompleted: false },
          { gateCode: "C", isCompleted: false },
        ],
        totalSteps: 3,
        stepsCompleted: 1,
        progressPercentage: 33,
      },
    },
  });

  it("recomputes the rollup so the two caches cannot disagree", () => {
    // The bug this prevents: the deal screen says 62% while the gates panel one
    // tap away says 69%, and the reader has no way to tell which is real.
    const out = patchIntelligenceGates(cache(), "B", true) as ReturnType<typeof cache>;
    expect(out.data.technicalTrack.stepsCompleted).toBe(2);
    expect(out.data.technicalTrack.progressPercentage).toBe(67);
  });

  it("recomputes downward too", () => {
    const out = patchIntelligenceGates(cache(), "A", false) as ReturnType<typeof cache>;
    expect(out.data.technicalTrack.stepsCompleted).toBe(0);
    expect(out.data.technicalTrack.progressPercentage).toBe(0);
  });

  it("returns the same reference when nothing changes", () => {
    const input = cache();
    expect(patchIntelligenceGates(input, "A", true)).toBe(input);
    expect(patchIntelligenceGates(input, "ZZZ", true)).toBe(input);
    expect(patchIntelligenceGates({ data: {} }, "A", true)).toEqual({ data: {} });
  });
});

describe("patchAlertDisposition", () => {
  const cache = () => ({
    data: {
      governance: {
        alerts: [{ patternCode: "CHAMPION_SILENT" }, { patternCode: "SINGLE_THREADED" }],
        managedAlerts: [{ patternCode: "OLD", disposition: "acknowledge" }],
      },
    },
  });

  it("moves the alert from open to managed, carrying the disposition", () => {
    const out = patchAlertDisposition(cache(), "CHAMPION_SILENT", "snooze") as ReturnType<typeof cache>;
    expect(out.data.governance.alerts.map((a) => a.patternCode)).toEqual(["SINGLE_THREADED"]);
    expect(out.data.governance.managedAlerts).toHaveLength(2);
    expect(out.data.governance.managedAlerts[1]).toMatchObject({
      patternCode: "CHAMPION_SILENT",
      disposition: "snooze",
    });
  });

  it("round-trips with the undo", () => {
    const dispositioned = patchAlertDisposition(cache(), "CHAMPION_SILENT", "acknowledge");
    const restored = unpatchAlertDisposition(dispositioned, "CHAMPION_SILENT") as ReturnType<typeof cache>;
    expect(restored.data.governance.alerts.map((a) => a.patternCode).sort()).toEqual([
      "CHAMPION_SILENT",
      "SINGLE_THREADED",
    ]);
    // The disposition is stripped on the way back, or the alert would return to
    // the open list still claiming to be managed.
    expect(restored.data.governance.alerts.every((a) => a.disposition === undefined)).toBe(true);
  });

  it("returns the same reference for an alert it does not hold", () => {
    const input = cache();
    expect(patchAlertDisposition(input, "NOT_THERE", "acknowledge")).toBe(input);
    expect(unpatchAlertDisposition(input, "NOT_THERE")).toBe(input);
  });

  it("creates the managed list when there isn't one", () => {
    const out = patchAlertDisposition(
      { data: { governance: { alerts: [{ patternCode: "X" }] } } },
      "X",
      "acknowledge",
    ) as ReturnType<typeof cache>;
    expect(out.data.governance.managedAlerts).toHaveLength(1);
  });
});

describe("patchPlaybookStep", () => {
  const cache = () => ({
    data: {
      assignments: [
        {
          assignmentId: "a1",
          totalCount: 4,
          completedCount: 1,
          progressPct: 25,
          steps: [
            { stepId: "s1", status: "completed", note: null },
            { stepId: "s2", status: null, note: null },
            { stepId: "s3", status: null, note: null },
            { stepId: "s4", status: null, note: null },
          ],
        },
        { assignmentId: "a2", totalCount: 1, steps: [{ stepId: "z", status: null }] },
      ],
    },
  });

  it("sets the step and recomputes progress", () => {
    const out = patchPlaybookStep(cache(), "a1", "s2", "completed") as ReturnType<typeof cache>;
    const assignment = out.data.assignments[0];
    expect(assignment.steps[1].status).toBe("completed");
    expect(assignment.completedCount).toBe(2);
    expect(assignment.progressPct).toBe(50);
  });

  it("counts a skip as resolved for progress while keeping it distinct", () => {
    // The panel used to render a skip as a green check, which claimed something
    // happened that explicitly did not. The state stays "skipped" so the UI can
    // show it honestly; progress still advances because the step is no longer
    // blocking.
    const out = patchPlaybookStep(cache(), "a1", "s2", "skipped") as ReturnType<typeof cache>;
    expect(out.data.assignments[0].steps[1].status).toBe("skipped");
    expect(out.data.assignments[0].completedCount).toBe(2);
  });

  it("does not count a block as progress", () => {
    const out = patchPlaybookStep(cache(), "a1", "s2", "blocked") as ReturnType<typeof cache>;
    expect(out.data.assignments[0].completedCount).toBe(1);
  });

  it("reopens a step back to no status", () => {
    const out = patchPlaybookStep(cache(), "a1", "s1", null) as ReturnType<typeof cache>;
    expect(out.data.assignments[0].steps[0].status).toBeNull();
    expect(out.data.assignments[0].completedCount).toBe(0);
  });

  it("carries a note, and clears it when none is given", () => {
    const withNote = patchPlaybookStep(cache(), "a1", "s2", "blocked", "waiting on legal") as ReturnType<typeof cache>;
    expect(withNote.data.assignments[0].steps[1].note).toBe("waiting on legal");
    const without = patchPlaybookStep(cache(), "a1", "s2", "completed") as ReturnType<typeof cache>;
    expect(without.data.assignments[0].steps[1].note).toBeNull();
  });

  it("leaves other assignments untouched, by reference", () => {
    const input = cache();
    const out = patchPlaybookStep(input, "a1", "s2", "completed") as ReturnType<typeof cache>;
    expect(out.data.assignments[1]).toBe(input.data.assignments[1]);
  });

  it("returns the same reference for an unknown assignment or step", () => {
    const input = cache();
    expect(patchPlaybookStep(input, "nope", "s1", "completed")).toBe(input);
    expect(patchPlaybookStep(input, "a1", "nope", "completed")).toBe(input);
  });
});
