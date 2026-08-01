import { describe, it, expect } from "vitest";
import { canRollback, formatChangeValue, buildExportFilename } from "./change-log-model";

describe("canRollback", () => {
  it("allows engine_thresholds update entries — the only server-supported case", () => {
    expect(canRollback("engine_thresholds", "update")).toBe(true);
  });

  it("rejects every other module, even on an update action", () => {
    expect(canRollback("webhooks", "update")).toBe(false);
    expect(canRollback("scoring_model_weights", "update")).toBe(false);
    expect(canRollback("fx_rates", "update")).toBe(false);
  });

  it("rejects non-update actions on engine_thresholds itself", () => {
    expect(canRollback("engine_thresholds", "create")).toBe(false);
    expect(canRollback("engine_thresholds", "delete")).toBe(false);
    expect(canRollback("engine_thresholds", "rollback")).toBe(false);
    expect(canRollback("engine_thresholds", "import")).toBe(false);
  });
});

describe("formatChangeValue", () => {
  it("renders null/undefined as an em dash rather than the literal word", () => {
    expect(formatChangeValue(null)).toBe("—");
    expect(formatChangeValue(undefined)).toBe("—");
  });

  it("renders primitives verbatim", () => {
    expect(formatChangeValue("21")).toBe("21");
    expect(formatChangeValue(21)).toBe("21");
    expect(formatChangeValue(true)).toBe("true");
    expect(formatChangeValue(false)).toBe("false");
    expect(formatChangeValue(0)).toBe("0");
  });

  it("renders objects as compact JSON instead of [object Object]", () => {
    expect(formatChangeValue({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
  });

  it("renders arrays as compact JSON", () => {
    expect(formatChangeValue([1, 2, 3])).toBe("[1,2,3]");
  });
});

describe("buildExportFilename", () => {
  it("keeps only the date portion of a full ISO timestamp", () => {
    expect(buildExportFilename("2026-08-01T12:34:56.000Z")).toBe("edc-settings-export-2026-08-01.json");
  });

  it("passes a bare date-only string through unchanged", () => {
    expect(buildExportFilename("2026-08-01")).toBe("edc-settings-export-2026-08-01.json");
  });
});
