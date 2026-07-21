import { describe, it, expect } from "vitest";
import { getTimeBand } from "./time-bands";

function at(hour: number, minute = 0): Date {
  return new Date(2026, 0, 1, hour, minute, 0);
}

describe("getTimeBand", () => {
  it("classifies 6:00 as morning (lower bound)", () => {
    expect(getTimeBand(at(6, 0))).toBe("morning");
  });
  it("classifies 11:59 as morning (upper bound)", () => {
    expect(getTimeBand(at(11, 59))).toBe("morning");
  });
  it("classifies 12:00 as afternoon (lower bound)", () => {
    expect(getTimeBand(at(12, 0))).toBe("afternoon");
  });
  it("classifies 16:59 as afternoon (upper bound)", () => {
    expect(getTimeBand(at(16, 59))).toBe("afternoon");
  });
  it("classifies 17:00 as evening (lower bound)", () => {
    expect(getTimeBand(at(17, 0))).toBe("evening");
  });
  it("classifies 20:59 as evening (upper bound)", () => {
    expect(getTimeBand(at(20, 59))).toBe("evening");
  });
  it("classifies 21:00 as night", () => {
    expect(getTimeBand(at(21, 0))).toBe("night");
  });
  it("classifies 0:00 (midnight) as night", () => {
    expect(getTimeBand(at(0, 0))).toBe("night");
  });
  it("classifies 5:59 as night (upper bound before the morning wrap)", () => {
    expect(getTimeBand(at(5, 59))).toBe("night");
  });
});
