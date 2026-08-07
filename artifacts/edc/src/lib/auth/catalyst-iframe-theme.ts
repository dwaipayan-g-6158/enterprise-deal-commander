/**
 * Restyles the Catalyst sign-in iframe to EDC's own design tokens.
 *
 * Zoho renders the form as a stark white panel with its own blue buttons and
 * Roboto/Arial type, which reads as a foreign widget dropped into EDC's card.
 * The frame is same-origin (`/accounts/…` on our own AppSail domain — the same
 * property `catalyst-iframe-autosize.ts` already relies on), and its document
 * carries no `style-src` CSP (only `frame-ancestors 'self'`), so a `<style>`
 * appended to its head applies normally. Verified live before this shipped.
 *
 * Why not the Catalyst console's CSS Customization instead: the tokens below
 * resolve to 2 themes × 4 `data-time-band` values × 2 shells = 16 different
 * palettes, and they genuinely differ (`--primary` is `222 90% 67%` on desktop
 * but `227 67% 55%` in mobile light; `--radius` is 4px vs 14px). A static file
 * served by the gateway can read none of that — it would hard-code one palette
 * and be actively WRONG in mobile light mode, where `--card` is pure white and
 * Zoho's own white panel is already nearly correct. Runtime resolution is the
 * only correct mechanism, so console CSS Customization stays off.
 *
 * Everything is `!important`, deliberately: only `!important` outranks an
 * inline `style` attribute, and Zoho appends step-specific `<link>`s as the
 * flow advances which would otherwise win over an earlier sheet at equal
 * specificity.
 *
 * The rules are in two tiers. Tier 1 uses only structural selectors (element
 * names, input types, pseudo-classes) that a third party cannot rename; Tier 2
 * names Zoho's own classes for what structure can't express. If Zoho renames
 * everything, Tier 1 alone still yields a transparent, Geist-typed, correctly
 * coloured form rather than a white box — the degradation floor.
 */

/** Colours are pre-wrapped `hsl(...)` strings, ready to interpolate. */
export interface IframeThemeTokens {
  colorScheme: "dark" | "light";
  fontStack: string;
  radius: string;
  card: string;
  cardForeground: string;
  foreground: string;
  mutedForeground: string;
  input: string;
  ring: string;
  primary: string;
  primaryForeground: string;
  destructive: string;
}

/**
 * Everything the resolver needs, kept as plain data so it is testable without
 * a DOM (this package's Vitest runs in a `node` environment).
 *
 * `tokens` is duck-typed on `CSSStyleDeclaration` rather than typed as one so
 * a plain object can stand in.
 */
export interface IframeThemeSource {
  tokens: { getPropertyValue(name: string): string };
  /** The parent's own resolved `font-family`, already a full stack. */
  fontStack: string;
  isDark: boolean;
}

// Anything outside this set is dropped rather than interpolated, which keeps
// buildIframeThemeCss total and means a malformed or hostile token value can't
// terminate a declaration and inject rules of its own.
const SAFE_VALUE = /^[a-zA-Z0-9\s%.,()'"#/-]+$/;

const FALLBACK: Omit<IframeThemeTokens, "colorScheme" | "fontStack"> = {
  radius: "0.25rem",
  card: "hsl(220 10% 12%)",
  cardForeground: "hsl(210 20% 98%)",
  foreground: "hsl(210 20% 98%)",
  mutedForeground: "hsl(210 10% 60%)",
  input: "hsl(220 10% 20%)",
  ring: "hsl(222 90% 67%)",
  primary: "hsl(222 90% 67%)",
  primaryForeground: "hsl(0 0% 100%)",
  destructive: "hsl(0 60% 50%)",
};

function raw(source: IframeThemeSource, name: string): string {
  // Chrome has historically returned a leading space for custom properties.
  const value = (source.tokens.getPropertyValue(name) ?? "").trim();
  return SAFE_VALUE.test(value) ? value : "";
}

/** Wraps an HSL triplet (`210 20% 98%`) as a colour, or returns the fallback. */
function color(source: IframeThemeSource, name: string, fallback: string): string {
  const value = raw(source, name);
  return value ? `hsl(${value})` : fallback;
}

/**
 * Reads EDC's live token values.
 *
 * The caller must pass a declaration resolved from the SLOT element, never
 * `:root` — custom properties inherit, so the slot picks up `.dark`,
 * `.m-shell` and `data-time-band` automatically, while `:root` misses every
 * `.m-shell` override and would silently apply the desktop palette on phones.
 */
export function resolveIframeThemeTokens(source: IframeThemeSource): IframeThemeTokens {
  return {
    colorScheme: source.isDark ? "dark" : "light",
    fontStack: SAFE_VALUE.test(source.fontStack.trim())
      ? source.fontStack.trim()
      : "'Geist', sans-serif",
    radius: raw(source, "--radius") || FALLBACK.radius,
    card: color(source, "--card", FALLBACK.card),
    // `--card-foreground` rather than `--foreground`: the form sits on the
    // card, not the page.
    cardForeground: color(source, "--card-foreground", FALLBACK.cardForeground),
    foreground: color(source, "--foreground", FALLBACK.foreground),
    mutedForeground: color(source, "--muted-foreground", FALLBACK.mutedForeground),
    input: color(source, "--input", FALLBACK.input),
    ring: color(source, "--ring", FALLBACK.ring),
    primary: color(source, "--primary", FALLBACK.primary),
    primaryForeground: color(source, "--primary-foreground", FALLBACK.primaryForeground),
    destructive: color(source, "--destructive", FALLBACK.destructive),
  };
}

/**
 * The stylesheet. Selector list validated against the live Zoho DOM across
 * desktop dark/light, mobile light, the field-error state and the focus ring.
 *
 * Two findings from that validation are encoded here and are easy to
 * accidentally undo:
 *  - The Next button carries a WHITE `box-shadow: 0px 2px 2px #fff` from
 *    Zoho's own sheet, which `border: 0` does not touch and which reads as a
 *    pale band under the button. Hence the blanket `box-shadow: none`.
 *  - Zoho's real field error is `.fielderror.errorlabel`, NOT the `.Alert` /
 *    `.Errormsg` nodes (which stay empty and parked off-screen). Without the
 *    error rule the blanket `color` below would render "This account does not
 *    exist" in ordinary body text, so it would not read as an error at all.
 *
 * Note `.Alert`/`.Errormsg` deliberately get colour only, no border: Tier 1's
 * selector carries an attribute `:not()` and so outranks a bare class, and a
 * border there would silently lose to it.
 */
export function buildIframeThemeCss(t: IframeThemeTokens): string {
  return `
:root { color-scheme: ${t.colorScheme} !important; }
html, body { background: transparent !important; }
body, body * { font-family: ${t.fontStack} !important; color: ${t.cardForeground} !important; box-shadow: none !important; }
body *:not(button):not(input):not(select):not(textarea):not(iframe):not(img):not(svg):not([class*="btn"]) { background-color: transparent !important; border: 0 !important; }
.signin_container, #signin_flow, .signin_box { background: transparent !important; }
#headtitle { font-size: 12px !important; font-weight: 500 !important; letter-spacing: .14em !important; text-transform: uppercase !important; color: ${t.mutedForeground} !important; }
input, input.textbox, input[type="text"], input[type="email"], input[type="password"] { background-color: transparent !important; color: ${t.cardForeground} !important; border: 1px solid ${t.input} !important; border-radius: ${t.radius} !important; box-sizing: border-box !important; padding: 0 12px !important; font-size: 14px !important; }
input::placeholder { color: ${t.mutedForeground} !important; opacity: 1 !important; }
input:focus, input:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid ${t.ring} !important; outline-offset: 2px !important; border-color: ${t.ring} !important; }
input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus { -webkit-box-shadow: 0 0 0 1000px ${t.card} inset !important; -webkit-text-fill-color: ${t.cardForeground} !important; caret-color: ${t.cardForeground} !important; }
button, #nextbtn, .btn, .btn.blue { background-color: ${t.primary} !important; color: ${t.primaryForeground} !important; border: 0 !important; border-radius: ${t.radius} !important; text-transform: none !important; font-weight: 600 !important; font-size: 14px !important; letter-spacing: 0 !important; }
a, .bluetext, .bluetext_action, #blueforgotpassword, .Notyou { color: ${t.mutedForeground} !important; text-decoration: none !important; }
a:hover, .bluetext:hover, .bluetext_action:hover, #blueforgotpassword:hover, .Notyou:hover { color: ${t.foreground} !important; }
.fielderror, .errorlabel, .Alert, .Errormsg, .error_message, .alert_message { color: ${t.destructive} !important; }
`.trim();
}

export interface ThemeVerdict {
  ok: boolean;
  missed: string[];
}

/**
 * Confirms the rules took EFFECT, not merely that they were inserted — a
 * renamed Zoho selector no-ops silently and the only symptom is a screenshot
 * nobody is looking at. Pure, so the whole check is unit-testable.
 *
 * `observed` values come from `getComputedStyle` and are therefore always
 * `rgb(...)`/`rgba(...)`, never the `hsl(...)` we asked for — so this compares
 * "did it move off Zoho's value", not "does it equal ours".
 */
export function verifyIframeTheme(
  observed: { panelBackground?: string; bodyFont?: string; buttonBackground?: string },
  _expected: IframeThemeTokens,
): ThemeVerdict {
  const missed: string[] = [];
  const opaque = (v: string | undefined): boolean =>
    !!v && v !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(v);

  if (opaque(observed.panelBackground)) missed.push("panel-background");
  if (observed.bodyFont !== undefined && !/geist/i.test(observed.bodyFont)) missed.push("body-font");
  // Zoho's button blue. If it is still this, our button rule did not match.
  if (observed.buttonBackground && /rgb\(\s*21,\s*154,\s*255\s*\)/.test(observed.buttonBackground)) {
    missed.push("button-background");
  }
  return { ok: missed.length === 0, missed };
}

const STYLE_ID = "edc-iframe-theme";
const FONT_ID = "edc-iframe-font";
// Same URL as index.html's, so it is an HTTP/Workbox cache hit rather than a
// second font download. Read from the parent at runtime where possible so it
// cannot drift from index.html; this is only the fallback.
const FONT_HREF_FALLBACK =
  "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap";

/**
 * Injects (or refreshes) the stylesheet in the frame's document.
 *
 * Guarded on the STYLE ELEMENT's presence in this document, deliberately not
 * on a `dataset` flag on the iframe like `catalyst-iframe-autosize.ts` uses:
 * that guard is per-iframe-ELEMENT, but "Forgot Password?" navigates the same
 * element to a new DOCUMENT, which needs the theme applied again.
 *
 * Goes in `<head>`, which also keeps it out of the autosize `MutationObserver`
 * (that one watches `body`). The caller must therefore re-measure afterwards —
 * restyling changes content height and nothing else will notice.
 */
export function applyIframeTheme(doc: Document, tokens: IframeThemeTokens): ThemeVerdict {
  if (!doc.head) return { ok: false, missed: ["no-head"] };

  const parentFontHref =
    typeof document !== "undefined"
      ? document.querySelector('link[href*="fonts.googleapis.com/css2"]')?.getAttribute("href")
      : null;
  if (!doc.getElementById(FONT_ID)) {
    const link = doc.createElement("link");
    link.id = FONT_ID;
    link.rel = "stylesheet";
    link.href = parentFontHref || FONT_HREF_FALLBACK;
    doc.head.appendChild(link);
  }

  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = STYLE_ID;
  }
  style.textContent = buildIframeThemeCss(tokens);
  // Re-append even when it already existed, so it stays last in head and wins
  // over any sheet Zoho added for the current step.
  doc.head.appendChild(style);

  const view = doc.defaultView;
  if (!view) return { ok: true, missed: [] };
  const panel = doc.querySelector(".signin_container") ?? doc.querySelector("#signin_flow");
  const button = doc.querySelector("#nextbtn") ?? doc.querySelector("button");
  return verifyIframeTheme(
    {
      panelBackground: panel ? view.getComputedStyle(panel).backgroundColor : undefined,
      bodyFont: doc.body ? view.getComputedStyle(doc.body).fontFamily : undefined,
      buttonBackground: button ? view.getComputedStyle(button).backgroundColor : undefined,
    },
    tokens,
  );
}

/**
 * Reads the tokens off `slot` and themes the frame's document. The one call
 * site is login.tsx, via the autosize module's `onDocument` hook.
 */
export function themeCatalystIframe(slot: HTMLElement, doc: Document): ThemeVerdict {
  const view = slot.ownerDocument?.defaultView;
  if (!view) return { ok: false, missed: ["no-view"] };
  const tokens = resolveIframeThemeTokens({
    tokens: view.getComputedStyle(slot),
    fontStack: view.getComputedStyle(slot.ownerDocument.body).fontFamily,
    isDark: slot.ownerDocument.documentElement.classList.contains("dark"),
  });
  return applyIframeTheme(doc, tokens);
}
