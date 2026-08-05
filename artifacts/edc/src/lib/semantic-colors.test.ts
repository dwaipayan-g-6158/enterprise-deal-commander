import { describe, expect, it } from "vitest";
import {
  classifyRisk,
  healthToRiskLevel,
  RISK_LEVEL_CLASS,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_SHORT_LABEL,
  HEALTH_BADGE_CLASS,
  HEALTH_CLASS,
  HEALTH_LABEL,
  HEALTH_SHORT_LABEL,
  OUTCOME_CLASS,
  RISK_LEVEL_HSL,
  HEALTH_HSL,
  OUTCOME_HSL,
  OUTCOME_RGB,
  BRIEFING_HEALTH_HEX,
  BRIEFING_OUTCOME_HEX,
  type RiskLevel,
  type Health,
} from "./semantic-colors";

const RISK_LEVELS: RiskLevel[] = ["LOW", "MODERATE", "ELEVATED", "HIGH"];
const HEALTHS: Health[] = ["GREEN", "YELLOW", "RED"];

describe("key completeness", () => {
  it("RISK_LEVEL_CLASS has every slot for every level", () => {
    for (const level of RISK_LEVELS) {
      const cls = RISK_LEVEL_CLASS[level];
      for (const slot of ["text", "bg", "border", "fill", "dot", "borderL", "cell"] as const) {
        expect(cls[slot]).toBeTruthy();
      }
    }
  });

  it("RISK_LEVEL_SHORT_LABEL has every level", () => {
    for (const level of RISK_LEVELS) {
      expect(RISK_LEVEL_SHORT_LABEL[level]).toBeTruthy();
    }
  });

  it("HEALTH_CLASS and HEALTH_HSL have all 3 health states", () => {
    for (const h of HEALTHS) {
      expect(HEALTH_CLASS[h]).toBeTruthy();
      expect(HEALTH_HSL[h]).toBeTruthy();
    }
  });

  it("OUTCOME_CLASS has both outcomes", () => {
    expect(OUTCOME_CLASS.won).toBeTruthy();
    expect(OUTCOME_CLASS.lost).toBeTruthy();
  });

  it("every scale has a chart form — a missing one is what makes callers hand-roll their own colours", () => {
    for (const outcome of ["won", "lost"] as const) {
      expect(OUTCOME_HSL[outcome]).toMatch(/^hsl\(/);
      expect(OUTCOME_RGB[outcome]).toMatch(/^\d+,\d+,\d+$/);
    }
  });
});

describe("health is its own traffic light, no longer derived from risk", () => {
  // Health used to alias RISK_LEVEL_CLASS[healthToRiskLevel(h)] wholesale, which
  // is why a badge reading "Healthy" rendered sky-blue. GREEN/YELLOW are now
  // authored; only RED still legitimately shares the risk ramp's red.
  it("GREEN is emerald, never the risk ramp's sky", () => {
    const all = Object.values(HEALTH_CLASS.GREEN).join(" ");
    expect(all).toMatch(/emerald-/);
    expect(all).not.toMatch(/sky-|teal-/);
  });

  it("YELLOW is true yellow, never amber — amber is MODERATE risk one column over", () => {
    const all = Object.values(HEALTH_CLASS.YELLOW).join(" ");
    expect(all).toMatch(/yellow-/);
    expect(all).not.toMatch(/amber-|orange-/);
  });

  it("RED still aliases the risk ramp's HIGH — both genuinely mean the same red", () => {
    expect(HEALTH_CLASS.RED).toBe(RISK_LEVEL_CLASS.HIGH);
    expect(HEALTH_HSL.RED).toBe(RISK_LEVEL_HSL.HIGH);
  });

  it("the chart forms carry the same hues as the class forms", () => {
    expect(HEALTH_HSL.GREEN).toBe("hsl(160 84% 39%)"); // emerald-500
    expect(HEALTH_HSL.YELLOW).toBe("hsl(45 93% 47%)"); // yellow-500
  });

  it("healthToRiskLevel still maps health onto the risk ramp — the cockpit falls back to it when a deal has no risk payload", () => {
    expect(healthToRiskLevel("GREEN")).toBe("LOW");
    expect(healthToRiskLevel("YELLOW")).toBe("MODERATE");
    expect(healthToRiskLevel("RED")).toBe("HIGH");
  });
});

// Health, Risk and Outcome can all render in the SAME roster row, so a hue
// shared between two of them is precisely the bug this module exists to
// prevent — the original one being low-risk and Closed-Won both rendering
// emerald. Pinned structurally so it holds through any future recolour,
// whatever hues get picked.
describe("cross-scale hue exclusivity", () => {
  const HUES = ["emerald", "green", "teal", "yellow", "amber", "orange", "sky", "violet", "indigo", "slate", "red"];
  const huesIn = (...classSets: object[]) => {
    const joined = classSets.map((c) => Object.values(c).join(" ")).join(" ");
    return HUES.filter((h) => joined.includes(`${h}-`));
  };

  it("Closed-Won shares no hue with any health state", () => {
    const won = huesIn(OUTCOME_CLASS.won);
    const health = huesIn(...HEALTHS.map((h) => HEALTH_CLASS[h]));
    expect(won.filter((h) => health.includes(h))).toEqual([]);
  });

  it("Closed-Won shares no hue with Closed-Lost", () => {
    const won = huesIn(OUTCOME_CLASS.won);
    expect(won.filter((h) => huesIn(OUTCOME_CLASS.lost).includes(h))).toEqual([]);
  });

  it("the calm end of the risk ramp shares no hue with the calm end of health", () => {
    // Only LOW/MODERATE vs GREEN/YELLOW: health RED and risk HIGH share red on
    // purpose. These are the pairs that sit side by side in the roster.
    const risk = huesIn(RISK_LEVEL_CLASS.LOW, RISK_LEVEL_CLASS.MODERATE);
    const health = huesIn(HEALTH_CLASS.GREEN, HEALTH_CLASS.YELLOW);
    expect(risk.filter((h) => health.includes(h))).toEqual([]);
  });
});

describe("semantic assertions — the actual bug fix, pinned", () => {
  it("risk LOW is sky — health has moved off this row, but the Risk column still rides it", () => {
    const allLow = Object.values(RISK_LEVEL_CLASS.LOW).join(" ");
    expect(allLow).toMatch(/sky-/);
    expect(allLow).not.toMatch(/emerald|green-|teal-/);
  });

  it("won is violet and never green — a won deal's row shows its health badge too", () => {
    const allWon = Object.values(OUTCOME_CLASS.won).join(" ");
    expect(allWon).toMatch(/violet-/);
    expect(allWon).not.toMatch(/emerald|green-|teal-/);
  });

  it("lost's chart form is the slate hue, not the destructive token", () => {
    // The win/loss donut used `hsl(var(--destructive))` for lost until
    // OUTCOME_HSL existed. --destructive is hue 0; slate is a desaturated blue.
    const [, hue, sat] = OUTCOME_HSL.lost.match(/hsl\((\d+) (\d+)%/) ?? [];
    expect(Number(hue)).toBeGreaterThan(180);
    expect(Number(sat)).toBeLessThan(30);
  });

  it("lost is slate, never rose/red/destructive", () => {
    const allLost = Object.values(OUTCOME_CLASS.lost).join(" ");
    expect(allLost).toMatch(/slate-/);
    expect(allLost).not.toMatch(/rose|red-|destructive/);
  });

  it("MODERATE/ELEVATED/HIGH are unchanged from the pre-existing palette", () => {
    expect(Object.values(RISK_LEVEL_CLASS.MODERATE).join(" ")).toMatch(/amber-/);
    expect(Object.values(RISK_LEVEL_CLASS.ELEVATED).join(" ")).toMatch(/orange-/);
    expect(Object.values(RISK_LEVEL_CLASS.HIGH).join(" ")).toMatch(/red-/);
  });
});

describe("health wording — the badge's text must never restate its own swatch", () => {
  // The enum values ARE colour names, so rendering one as the badge's own text
  // asserts the swatch rather than the meaning — and reads as a bug the instant
  // a palette change makes the two disagree (a "GREEN" badge rendering sky).
  // Pinned so a future edit can't quietly put the raw enum back on screen.
  for (const [name, map] of Object.entries({ HEALTH_LABEL, HEALTH_SHORT_LABEL })) {
    it(`${name}: every state has a non-empty label that isn't its own key`, () => {
      for (const h of HEALTHS) {
        expect(map[h]).toBeTruthy();
        expect(map[h]).not.toBe(h);
      }
    });

    it(`${name}: no label reuses a colour word as text`, () => {
      for (const h of HEALTHS) {
        expect(map[h].toLowerCase()).not.toMatch(/green|yellow|red|blue|sky|amber|emerald|violet/);
      }
    });
  }

  it("the short form is never longer than the long form — it exists for fixed-height cells", () => {
    for (const h of HEALTHS) {
      expect(HEALTH_SHORT_LABEL[h].length).toBeLessThanOrEqual(HEALTH_LABEL[h].length);
    }
  });

  it("health wording never collides with risk wording — they are adjacent columns", () => {
    const riskWords = new Set([
      ...Object.values(RISK_LEVEL_LABEL),
      ...Object.values(RISK_LEVEL_SHORT_LABEL),
    ]);
    for (const h of HEALTHS) {
      expect(riskWords.has(HEALTH_LABEL[h])).toBe(false);
      expect(riskWords.has(HEALTH_SHORT_LABEL[h])).toBe(false);
    }
  });
});

describe("print-literal guard — briefing export must stay static hex", () => {
  const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

  it("every BRIEFING_HEALTH_HEX value is a bare hex literal", () => {
    for (const h of HEALTHS) {
      const v = BRIEFING_HEALTH_HEX[h];
      expect(v).toMatch(HEX_RE);
      expect(v).not.toMatch(/var\(|oklch\(/);
    }
  });

  it("every BRIEFING_OUTCOME_HEX value is a bare hex literal", () => {
    for (const v of Object.values(BRIEFING_OUTCOME_HEX)) {
      expect(v).toMatch(HEX_RE);
      expect(v).not.toMatch(/var\(|oklch\(/);
    }
  });

  it("won's hex differs from every health hex — the two were literally the same emerald once", () => {
    for (const h of HEALTHS) {
      expect(BRIEFING_OUTCOME_HEX.won).not.toBe(BRIEFING_HEALTH_HEX[h]);
    }
  });
});

describe("classifyRisk boundaries (pins scoreColor's threshold equivalence)", () => {
  it.each([
    [0, "LOW"],
    [25, "LOW"],
    [26, "MODERATE"],
    [50, "MODERATE"],
    [51, "ELEVATED"],
    [75, "ELEVATED"],
    [76, "HIGH"],
    [100, "HIGH"],
  ] as const)("classifyRisk(%i) === %s", (score, expected) => {
    expect(classifyRisk(score)).toBe(expected);
  });
});
// Contrast, pinned structurally.
//
// A unit test cannot compute a contrast ratio — a Tailwind class name carries
// no colour until the compiler resolves it, and jsdom has no compiler. What it
// can do is lock the shape that made the ratios pass, so nobody reaches for a
// lighter shade without re-running the measurement first.
//
// Those measurements come from painting every level on every surface it is
// used on, in both themes, in a real browser (rule 6 in semantic-colors.ts).
// The whole risk ramp used to sit at -600 and every level of it failed AA on
// white — sky 3.66, amber 2.91, orange 3.27, red 4.34. Only MODERATE and
// YELLOW had ever been caught, because they were the only two the seed data
// put on screen, which is the argument for pinning this rather than trusting
// the next spot-check.
describe("WCAG AA — light-mode shade floors", () => {
  /** The light-mode half of a `text-x-700 dark:text-x-400` pair. */
  const lightShade = (classes: string, prefix = "text") => {
    const hit = classes
      .split(/\s+/)
      .filter((c) => !c.includes(":"))
      .find((c) => c.startsWith(`${prefix}-`) && /-\d{2,3}$/.test(c));
    return hit ? Number(hit.slice(hit.lastIndexOf("-") + 1)) : null;
  };
  /** Opacity modifiers on the light-mode half of a `bg` string. */
  const lightAlphas = (classes: string) =>
    classes
      .split(/\s+/)
      .filter((c) => !c.includes(":"))
      .map((c) => c.match(/\/(\d+)$/)?.[1])
      .filter((a): a is string => a != null)
      .map(Number);

  // Risk and health are the chromatic ramps, and chroma is what costs
  // contrast: a saturated -600 is nowhere near dark enough against white.
  const CHROMATIC: [string, { text: string; bg: string; cell: string }][] = [
    ...RISK_LEVELS.map((l) => [`RISK.${l}`, RISK_LEVEL_CLASS[l]] as const),
    ...HEALTHS.map((h) => [`HEALTH.${h}`, HEALTH_CLASS[h]] as const),
  ];

  it.each(CHROMATIC)("%s text is -700 or darker", (_name, cls) => {
    expect(lightShade(cls.text)).toBeGreaterThanOrEqual(700);
  });

  it.each(CHROMATIC)("%s heatmap cell text is -800 or darker", (_name, cls) => {
    // The cell paints its text on a 15% tint of its own hue, which costs
    // roughly one shade step against the same text on a plain card.
    expect(lightShade(cls.cell)).toBeGreaterThanOrEqual(800);
  });

  it.each(CHROMATIC)("%s tint stays at 8% or lighter", (_name, cls) => {
    const alphas = lightAlphas(cls.bg);
    expect(alphas.length).toBeGreaterThan(0);
    // Lightening the tint from 12% is what bought MODERATE its last 0.07,
    // rather than darkening amber past orange and inverting the ramp.
    for (const a of alphas) expect(a).toBeLessThanOrEqual(8);
  });

  it("yellow carries an extra step — it is the worst hue in the palette", () => {
    // At -700 it measured 4.30 on the cell and 4.38 on its own tint.
    expect(lightShade(HEALTH_CLASS.YELLOW.text)).toBeGreaterThanOrEqual(800);
  });

  // Outcome is exempt from the -700 floor, and the exemption is measured
  // rather than assumed: slate is a neutral, so slate-600 already reads at
  // 7.26 on a card and 6.05 on its own 15% tint, and violet-700 reads at
  // 5.77. Neither needs the extra step the chromatic ramps do.
  it.each([
    ["won", OUTCOME_CLASS.won, 700],
    ["lost", OUTCOME_CLASS.lost, 600],
  ] as const)("OUTCOME.%s text holds at its measured shade", (_name, cls, floor) => {
    expect(lightShade(cls.text)).toBeGreaterThanOrEqual(floor);
  });

  // Solid badges carry their own fill, so they live in a different map from
  // the tinted pairs above — and that is exactly how HEALTH_BADGE_CLASS.GREEN
  // sat at white-on-emerald-600 (3.65:1) through a sweep that called itself
  // exhaustive. A white-text badge needs -700 or darker to clear AA.
  it.each(
    Object.entries(HEALTH_BADGE_CLASS)
      .filter(([, cls]) => cls.includes("text-white"))
      .map(([level, cls]) => [level, cls] as const),
  )("HEALTH_BADGE.%s carries white on -700 or darker", (_level, cls) => {
    expect(lightShade(cls, "bg")).toBeGreaterThanOrEqual(700);
  });
});
