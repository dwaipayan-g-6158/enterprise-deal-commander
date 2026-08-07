/**
 * Re-applies EDC's sign-in theme inside the Catalyst iframe.
 *
 * `catalyst-client.ts` already passes `css_url` to `signIn()`, which is the
 * primary delivery path and the better one: Zoho fetches the sheet itself, so
 * it applies BEFORE the frame's first paint — no flash of Zoho's white panel,
 * and no specificity war with rules that load later.
 *
 * This exists because `css_url` covers only the sign-in document. Catalyst
 * navigates the SAME iframe to /accounts/p/{zaid}/password for
 * "Forgot Password?", and that page ignores `css_url` and ships its own
 * light-theme reset — so without re-injection the recovery step renders
 * black-on-dark and unreadable. Same-origin access (the property
 * catalyst-iframe-autosize.ts already depends on) lets us add the same
 * stylesheet to whichever document is currently loaded.
 */

/** Must match the file in `public/`, which Vite serves from the site root. */
const THEME_HREF = "/login-iframe.css";
const MARKER = "data-edc-theme";

/**
 * Adds the theme stylesheet to `doc` unless it is already there.
 *
 * Idempotency is keyed on a marker attribute in THIS document rather than on a
 * flag on the iframe element, deliberately: a recovery-page navigation reuses
 * the same element but gets a new document, and an element-scoped guard would
 * skip it — leaving exactly the unreadable page this function exists to fix.
 *
 * Returns whether the stylesheet is now present, so a caller can surface a
 * partial application rather than failing silently.
 */
export function injectCatalystIframeTheme(doc: Document): boolean {
  if (!doc.head) return false;
  if (doc.querySelector(`link[${MARKER}="1"]`)) return true;

  const link = doc.createElement("link");
  link.rel = "stylesheet";
  // Absolute, from the parent's own origin: the frame's document is same-origin
  // today, but a relative href would resolve against whatever Zoho path is
  // loaded rather than against ours.
  link.href = `${window.location.origin}${THEME_HREF}`;
  link.setAttribute(MARKER, "1");
  doc.head.appendChild(link);
  return true;
}
