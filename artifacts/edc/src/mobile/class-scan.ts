/**
 * Static scanning of `className` values in JSX source.
 *
 * Exists because the mobile type ladder is declared UNLAYERED — that is what
 * lets `.m-headline` beat an `<ItemTitle>`'s baked-in `text-sm font-medium`
 * instead of losing to it. The same precedence means `className="m-caption
 * text-xs"` silently ignores `text-xs`: the element renders at 13px, the author
 * believes they wrote 12px, and nothing complains. This finds that.
 *
 * Pure string work, no DOM, no parser dependency — vitest runs `environment:
 * "node"` and this stays cheap enough to run over the whole shell on every
 * suite. Consumed by type-usage.test.ts.
 */

/**
 * Removes line and block comments that sit outside string literals.
 *
 * Applied to every extracted expression before anything else looks at it,
 * because a comment is prose and prose contains apostrophes. A `cn()` annotated
 * with `// lifts the bar out of the route transition's root snapshot` has a lone
 * `'` in it; read as an opening quote, it silently inverts the string state for
 * the rest of the scan. Comments can also hold `?`, `:` and braces, any of which
 * would derail brace matching or ternary expansion.
 */
export function stripCodeComments(expr: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (quote) {
      out += ch;
      if (ch === quote && expr[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && expr[i + 1] === "/") {
      const nl = expr.indexOf("\n", i);
      if (nl === -1) break;
      i = nl - 1;
      continue;
    }
    if (ch === "/" && expr[i + 1] === "*") {
      const close = expr.indexOf("*" + "/", i + 2);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Marks each index as being outside a string literal. */
export function outsideStrings(expr: string): boolean[] {
  const out: boolean[] = [];
  let quote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (quote) {
      out.push(false);
      if (ch === quote && expr[i - 1] !== "\\") quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      out.push(false);
      quote = ch;
    } else {
      out.push(true);
    }
  }
  return out;
}

/**
 * Every `className=` value in a source file.
 *
 * `{...}` expressions are read by brace-matching (skipping braces inside string
 * literals, so a `content-['{']` arbitrary value can't unbalance the count) and
 * returned whole, so a multi-line `cn("m-caption", dense && "text-xs")` is
 * examined as one unit. Scanning individual string literals instead would miss
 * exactly that split form — the one an author is most likely to write without
 * noticing.
 */
export function classNameExpressions(source: string): string[] {
  const out: string[] = [];

  for (const m of source.matchAll(/className=/g)) {
    const at = m.index! + m[0].length;
    const open = source[at];

    if (open === '"' || open === "'") {
      const end = source.indexOf(open, at + 1);
      if (end !== -1) out.push(source.slice(at + 1, end));
      continue;
    }
    if (open !== "{") continue;

    // Quote state is tracked from `at` rather than precomputed over the file,
    // and that is load-bearing. A whole-file pass mistakes the apostrophe in
    // ordinary JSX prose ("Here's what needs you") for the start of a string
    // literal, and every brace after it is misclassified — so one className
    // silently swallows the next two hundred lines and reports collisions
    // between classes that live on different elements. Starting here is safe
    // because directly after `className=` we are known to be outside a string.
    //
    // Comments are skipped for the same reason one level down: the expression
    // itself may carry `//` annotations, and those are prose too.
    let depth = 0;
    let quote: string | null = null;
    for (let i = at; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === quote && source[i - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "/" && source[i + 1] === "/") {
        const nl = source.indexOf("\n", i);
        if (nl === -1) break;
        i = nl - 1;
        continue;
      }
      if (ch === "/" && source[i + 1] === "*") {
        const close = source.indexOf("*" + "/", i + 2);
        if (close === -1) break;
        i = close + 1;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          out.push(stripCodeComments(source.slice(at + 1, i)));
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Expands `cond ? A : B` into the two worlds it can produce.
 *
 * Without this, `cn("mt-1", big ? "m-title" : "m-headline")` reads as two
 * stacked rungs, which is false — exactly one branch ever lands. That kind of
 * false positive is fatal to a guard suite: the next person to hit it deletes
 * the test rather than the bug, and every real finding goes with it.
 *
 * The condition text is left in place because it holds no class literals.
 */
export function expandTernaries(expr: string, depth = 0): string[] {
  if (depth > 6) return [expr]; // pathological nesting — report as written
  const live = outsideStrings(expr);

  let q = -1;
  for (let i = 0; i < expr.length; i++) {
    // `?.` and `??` are not conditionals.
    if (expr[i] === "?" && live[i] && expr[i + 1] !== "." && expr[i + 1] !== "?" && expr[i - 1] !== "?") {
      q = i;
      break;
    }
  }
  if (q === -1) return [expr];

  let nest = 0;
  let colon = -1;
  for (let i = q + 1; i < expr.length; i++) {
    if (!live[i]) continue;
    if (expr[i] === "?" && expr[i + 1] !== "." && expr[i + 1] !== "?") nest++;
    else if (expr[i] === ":") {
      if (nest === 0) {
        colon = i;
        break;
      }
      nest--;
    }
  }
  if (colon === -1) return [expr];

  // The false branch ends at the next comma or closing bracket at this depth.
  let bracket = 0;
  let end = expr.length;
  for (let i = colon + 1; i < expr.length; i++) {
    if (!live[i]) continue;
    const ch = expr[i];
    if ("([{".includes(ch)) bracket++;
    else if (")]}".includes(ch)) {
      if (bracket === 0) {
        end = i;
        break;
      }
      bracket--;
    } else if (ch === "," && bracket === 0) {
      end = i;
      break;
    }
  }

  const head = expr.slice(0, q);
  const tail = expr.slice(end);
  return [
    ...expandTernaries(head + expr.slice(q + 1, colon) + tail, depth + 1),
    ...expandTernaries(head + expr.slice(colon + 1, end) + tail, depth + 1),
  ];
}

/** Every class-set a `className` can actually render, one per reachable world. */
export function classWorlds(source: string): string[] {
  return classNameExpressions(source).flatMap((e) => expandTernaries(e));
}

/** The eight rungs of the mobile type ladder. `.m-muted` is colour, not a rung. */
export const TYPE_CLASS = /\bm-(?:hero|display|title|headline|body|label|caption|micro)\b/g;

/**
 * Utilities the type styles already set, and therefore silently win against.
 * Colour utilities are deliberately absent: the ladder carries no colour
 * precisely so `text-destructive` and the semantic-colors classes keep working
 * beside it.
 */
export const TYPOGRAPHY_CONFLICTS: { pattern: RegExp; property: string }[] = [
  { pattern: /\btext-(?:xs|sm|base|lg|\d?xl|\[[^\]]*\])\b/g, property: "font-size" },
  {
    pattern:
      /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[[^\]]*\])\b/g,
    property: "font-weight",
  },
  { pattern: /\btracking-[\w[\]().-]+/g, property: "letter-spacing" },
  { pattern: /\bleading-[\w[\]().-]+/g, property: "line-height" },
];

/**
 * Colour roles that thin glass cannot legibly carry.
 *
 * tokens.css measures both weights over every backdrop that can scroll beneath
 * them. Regular glass carries any text; thin glass carries --foreground-coloured
 * content only, because --muted-foreground and --primary land at roughly 3.3:1
 * on it. The palette suite proves the numbers, but nothing stopped a component
 * from putting a muted label on a thin surface anyway — which is exactly what
 * the first draft of MSegmented did.
 */
export const THIN_GLASS_FORBIDDEN = /\b(m-muted|text-muted-foreground|text-primary|text-destructive)\b/g;

export interface TypeFinding {
  world: string;
  message: string;
}

/** Type-ladder misuse in one file's source: overridden utilities and stacked rungs. */
export function findTypeCollisions(source: string): TypeFinding[] {
  const findings: TypeFinding[] = [];

  for (const world of classWorlds(source)) {
    const rungs = [...new Set([...world.matchAll(TYPE_CLASS)].map((m) => m[0]))];
    if (rungs.length === 0) continue;

    if (rungs.length > 1) {
      // Two rungs is not an override so much as an unanswerable question: which
      // size did the author mean? Stylesheet source order decides, which is to
      // say nobody decided.
      findings.push({ world, message: `stacks ${rungs.join(" + ")} on one element` });
    }

    for (const { pattern, property } of TYPOGRAPHY_CONFLICTS) {
      const hit = [...world.matchAll(pattern)][0];
      if (!hit) continue;
      findings.push({
        world,
        message: `"${rungs[0]}" already sets ${property}, so "${hit[0]}" does nothing`,
      });
    }
  }

  return findings;
}

/**
 * Muted or accent text placed directly on thin glass.
 *
 * Only flags the same className — a thin-glass CONTAINER with muted text on a
 * child element is a real risk too, but it cannot be judged from source without
 * resolving the tree, and a scanner that guesses produces false positives. The
 * same-element case is the one that is unambiguous, and it is the one that
 * actually happened.
 */
export function findThinGlassMisuse(source: string): TypeFinding[] {
  const findings: TypeFinding[] = [];
  for (const world of classWorlds(source)) {
    if (!/\bm-glass-thin\b/.test(world)) continue;
    const hit = [...world.matchAll(THIN_GLASS_FORBIDDEN)][0];
    if (!hit) continue;
    findings.push({
      world,
      message: `"${hit[0]}" is not legible on .m-glass-thin — use .m-glass, or an opaque surface`,
    });
  }
  return findings;
}
