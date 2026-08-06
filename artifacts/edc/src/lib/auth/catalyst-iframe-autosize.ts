/**
 * Sizes the Catalyst sign-in iframe to its own content.
 *
 * The Web SDK injects a fixed ~150px-tall iframe into the slot and never
 * resizes it, so Zoho's form renders clipped behind an internal scrollbar —
 * and it grows between steps (email → password → email-OTP) and again on the
 * "Forgot Password?" recovery page, none of which the SDK accounts for.
 * login.tsx's docstring flagged this as deliberate debt to revisit "if the raw
 * iframe looks out of place"; it only became visible once the form actually
 * rendered at all (before the service-worker fix in vite.config.ts's
 * navigateFallbackDenylist the iframe was blank, so the clipping was hidden
 * behind a bigger bug).
 *
 * The iframe is same-origin — /accounts/… on our own AppSail domain — so its
 * document is directly readable and measurable. Mirrors the approach the
 * sibling Customer-Insight-Engine project uses, minus its theme re-injection
 * and error-copy rewriting: this project has CSS Customization disabled in the
 * Catalyst console, so there is no stylesheet to re-inject.
 */

// Below the shortest real step (email + Next + "Forgot Password?"); above the
// SDK's own 150px, which is what produced the clipping.
const MIN_HEIGHT = 260;
// Guards against a runaway measurement forcing an absurd card.
const MAX_HEIGHT = 720;
// Zoho's own page padding stops short of the last link; without a little slack
// the "Forgot Password?" row sits flush against the bottom edge.
const BOTTOM_PADDING = 24;
// Re-measure after load: webfonts and the flow's own entry animation settle
// after `load` fires, and each lands a different final height.
const SETTLE_DELAYS_MS = [150, 400, 900];

/**
 * Height of the real content, measured as the bottom of the lowest visible
 * LEAF element.
 *
 * Not `scrollHeight`: Zoho's `#signin_flow` wrapper is `height: 100%`, so the
 * document just echoes back whatever height we last gave the frame. Measuring
 * that ratchets the frame upward until it hits the cap and sticks — observed
 * live, a ~320px form reported 560px and rendered a card taller than the
 * viewport. Collapsing the frame first doesn't help either: setting
 * `iframe.style.height` does not synchronously re-lay-out the CHILD document,
 * so the collapsed read returns the same stale number (also confirmed live).
 *
 * Leaf elements — the heading, the input, the button, the "Forgot Password?"
 * link — are the actual content and never stretch to fill their container, so
 * the lowest one is a stable measure that does not move when the frame grows
 * (Zoho's flow is top-anchored, not vertically centred). Falls back to
 * scrollHeight only if the document has no leaves yet.
 */
function measureContent(doc: Document): number {
  const view = doc.defaultView;
  let lowest = 0;
  for (const el of doc.querySelectorAll("body *")) {
    if (el.childElementCount > 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) continue;
    if (view && view.getComputedStyle(el).visibility === "hidden") continue;
    if (rect.bottom > lowest) lowest = rect.bottom;
  }
  if (lowest > 0) return lowest;
  return Math.max(
    doc.documentElement ? doc.documentElement.scrollHeight : 0,
    doc.body ? doc.body.scrollHeight : 0,
  );
}

/**
 * Starts watching `slot` for the SDK's iframe and keeps its height in sync
 * with the content. Returns a cleanup that detaches every observer.
 */
export function attachCatalystIframeAutosize(slot: HTMLElement): () => void {
  let stopped = false;
  let frame = 0;
  const timers: number[] = [];
  const cleanups: Array<() => void> = [];

  const applyHeight = (iframe: HTMLIFrameElement): void => {
    if (stopped) return;
    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch {
      // Cross-origin (a federated/social sign-in hop) — the SDK's own height
      // is all we have; leave it alone rather than throwing on every tick.
      return;
    }
    if (!doc || !doc.documentElement) return;
    const measured = measureContent(doc);
    if (!measured) return;
    const wanted = Math.ceil(measured) + BOTTOM_PADDING;
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, wanted));

    // Zoho's <body> carries a fixed ~520px height regardless of how little is
    // in it, so a frame sized to the actual content leaves the document
    // overflowing by a couple hundred pixels of pure whitespace and Chrome
    // draws a scrollbar down the side of the card. Nothing is clipped — the
    // content ends well above the fold — so hide the child's own scrollbar
    // once we know the frame is tall enough to hold everything. If the
    // measurement had to be clamped, the overflow may be real: leave the
    // scrollbar so the user can still reach the rest.
    //
    // Feature-tested rather than `instanceof HTMLElement`: documentElement
    // belongs to the IFRAME's realm, so it fails an instanceof against this
    // page's constructor even though it is a perfectly ordinary <html>. That
    // guard silently skipped this whole block on the first attempt.
    const root = doc.documentElement as unknown as { style?: CSSStyleDeclaration };
    if (root.style) {
      root.style.overflow = next >= wanted ? "hidden" : "";
    }

    if (Math.abs(next - iframe.getBoundingClientRect().height) <= 2) return;
    iframe.style.height = `${next}px`;
  };

  const scheduleApply = (iframe: HTMLIFrameElement): void => {
    if (stopped) return;
    // Zoho's step transitions land as bursts of mutations; coalesce them into
    // one measurement per frame.
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => applyHeight(iframe));
  };

  const watchDocument = (iframe: HTMLIFrameElement): void => {
    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch {
      return;
    }
    if (!doc || !doc.body) return;

    // Deliberately a MutationObserver on the DOM rather than a ResizeObserver
    // on documentElement: measuring writes the height twice (collapse, then
    // restore), which a ResizeObserver would report as a resize, re-entering
    // this on every frame forever. Zoho advances its steps by swapping DOM, so
    // mutations are the signal that actually corresponds to a height change,
    // and our own writes never touch the iframe's DOM.
    const observer = new MutationObserver(() => scheduleApply(iframe));
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true });
    cleanups.push(() => observer.disconnect());

    applyHeight(iframe);
  };

  const wire = (iframe: HTMLIFrameElement): void => {
    // "Forgot Password?" navigates this same iframe, so re-measure per load.
    const onLoad = (): void => {
      applyHeight(iframe);
      watchDocument(iframe);
      for (const delay of SETTLE_DELAYS_MS) {
        timers.push(window.setTimeout(() => applyHeight(iframe), delay));
      }
    };
    iframe.addEventListener("load", onLoad);
    cleanups.push(() => iframe.removeEventListener("load", onLoad));

    let ready = false;
    try {
      ready = iframe.contentDocument?.readyState === "complete";
    } catch {
      ready = false;
    }
    // The SDK may have finished loading it before this observer attached.
    if (ready) onLoad();
  };

  const wireOnce = (iframe: HTMLIFrameElement | null): void => {
    if (!iframe || iframe.dataset.edcAutosized) return;
    iframe.dataset.edcAutosized = "1";
    wire(iframe);
  };

  wireOnce(slot.querySelector("iframe"));

  // The SDK injects the iframe asynchronously, after signIn() resolves.
  const slotObserver = new MutationObserver(() => wireOnce(slot.querySelector("iframe")));
  slotObserver.observe(slot, { childList: true, subtree: true });
  cleanups.push(() => slotObserver.disconnect());

  return () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
    for (const id of timers) window.clearTimeout(id);
    for (const fn of cleanups) fn();
  };
}
