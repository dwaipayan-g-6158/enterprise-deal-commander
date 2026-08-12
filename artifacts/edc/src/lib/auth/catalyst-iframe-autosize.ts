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
 * sibling Customer-Insight-Engine project uses, minus its error-copy
 * rewriting.
 *
 * Theming is not done here but IS driven from here, via the `onDocument` hook:
 * see catalyst-iframe-theme.ts. It has to run per DOCUMENT rather than per
 * iframe element, and `onLoad` below is the one place that fires for both the
 * initial render and the "Forgot Password?" navigation. (EDC deliberately does
 * not use the Catalyst console's CSS Customization for this — the tokens are
 * resolved per theme/time-band/shell at runtime, which a static stylesheet
 * served by the gateway cannot do.)
 */

// A floor for when measurement fails outright, NOT a target. It was 260, which
// was above the real email step: measured live, that step wants 164 (button
// bottom 140 + BOTTOM_PADDING), so every frame got clamped UP and the card
// carried 80px of dead space under the button. Kept above the SDK's own 150px,
// which is the height that produced the original clipping.
const MIN_HEIGHT = 170;
// Guards against a runaway measurement forcing an absurd card.
const MAX_HEIGHT = 720;
// Zoho's own page padding stops short of the last link; without a little slack
// the "Forgot Password?" row sits flush against the bottom edge.
const BOTTOM_PADDING = 24;
// Re-measure after load: webfonts and the flow's own entry animation settle
// after `load` fires, and each lands a different final height.
const SETTLE_DELAYS_MS = [150, 400, 900];
// Backstop for the anti-flash gate in wireOnce: however theming goes, the frame
// is visible by now.
const REVEAL_FALLBACK_MS = 250;

// A rect smaller than this is a hidden or decorative control, not the step's
// primary button.
const MIN_BUTTON_WIDTH = 40;
const MIN_BUTTON_HEIGHT = 20;

/**
 * Every place a document's own vertical scroll offset can hide.
 *
 * Split out as a pure choice for the same reason as `pickButtonAnchor`: it is
 * the correction that keeps the measurement below scroll-invariant, and it was
 * silently reading zero for the whole life of this file.
 *
 * Zoho's document is quirks mode (`compatMode === "BackCompat"`) AND this
 * sheet puts `overflow: hidden` on the root. Together those make
 * `document.scrollingElement` **null** and park the offset in
 * `defaultView.scrollY` alone: measured live on the password step,
 * `scrollY === 16` while `body.scrollTop` and `documentElement.scrollTop` both
 * read `0`. So the original `body.scrollTop` read — documented as
 * load-bearing — had been adding nothing, and every measurement taken while
 * the frame was scrolled came out short by exactly the scroll amount.
 *
 * Precedence, not a sum, and not a max: in quirks mode `scrollY` and
 * `body.scrollTop` are two views of the SAME scroll, so adding them
 * double-counts. `scrollY` is the viewport offset by definition in every
 * mode, so it wins whenever a window exists; the element offsets are the
 * fallback for a detached document, and for the older shape of this bug where
 * `body` was itself the scroll container (`height: 100%`, measured at
 * `scrollTop: 88`) and the viewport never moved.
 */
export interface ScrollOffsetSource {
  /** `defaultView.scrollY` — undefined when the document has no window. */
  viewScrollY?: number;
  documentElementScrollTop?: number;
  bodyScrollTop?: number;
}

/** The document's vertical scroll offset, from whichever source reports it. */
export function pickScrollOffset(source: ScrollOffsetSource): number {
  const { viewScrollY, documentElementScrollTop, bodyScrollTop } = source;
  if (viewScrollY) return viewScrollY;
  return documentElementScrollTop || bodyScrollTop || 0;
}

/** One candidate control, reduced to the geometry the choice depends on. */
export interface ButtonAnchorCandidate {
  /** Bottom edge in DOCUMENT-relative coords — `rect.bottom + scroll offset`. */
  bottom: number;
  width: number;
  height: number;
  /** False when the element isn't laid out (`offsetParent === null`). */
  rendered: boolean;
}

/**
 * Lowest plausible primary-button bottom edge, or null if none qualifies.
 *
 * Split out as pure geometry so the selection rules are unit-testable without a
 * DOM (this package's Vitest runs in a `node` environment).
 *
 * Document-relative, not viewport-relative, and that distinction is
 * load-bearing: Zoho auto-scrolls the frame whenever a field takes focus, so a
 * viewport-relative bottom shrinks as it scrolls, which feeds back into a
 * smaller frame and eventually clips the form. `pickScrollOffset` supplies the
 * correction — see the note there for where that offset actually hides.
 */
export function pickButtonAnchor(candidates: readonly ButtonAnchorCandidate[]): number | null {
  let lowest: number | null = null;
  for (const c of candidates) {
    if (!c.rendered) continue;
    if (c.width < MIN_BUTTON_WIDTH || c.height < MIN_BUTTON_HEIGHT) continue;
    if (!(c.bottom > 0)) continue;
    if (lowest === null || c.bottom > lowest) lowest = c.bottom;
  }
  return lowest;
}

/**
 * Height of the real content.
 *
 * Anchored on the step's primary button, matching the sibling
 * Customer-Insight-Engine project: every Catalyst step ends in one, so its
 * bottom edge tracks email → password → OTP → recovery correctly, and the
 * resulting clip is deliberate — it is what hides Zoho's orphan tail elements.
 *
 * Not `scrollHeight`: Zoho's `#signin_flow` wrapper is `height: 100%`, so the
 * document just echoes back whatever height we last gave the frame. Measuring
 * that ratchets the frame upward until it hits the cap and sticks — observed
 * live, a ~320px form reported 560px and rendered a card taller than the
 * viewport. Collapsing the frame first doesn't help either: setting
 * `iframe.style.height` does not synchronously re-lay-out the CHILD document,
 * so the collapsed read returns the same stale number (also confirmed live).
 *
 * Falls back to the lowest visible LEAF element (the previous strategy, proven
 * on the email step) when no button qualifies — e.g. an interstitial that
 * renders only text — and to scrollHeight if the document is still empty.
 */
function measureContent(doc: Document): number {
  const view = doc.defaultView;
  const scrollTop = pickScrollOffset({
    viewScrollY: view ? view.scrollY : undefined,
    documentElementScrollTop: doc.documentElement ? doc.documentElement.scrollTop : undefined,
    bodyScrollTop: doc.body ? doc.body.scrollTop : undefined,
  });

  const candidates: ButtonAnchorCandidate[] = [];
  for (const el of doc.querySelectorAll<HTMLElement>('button, input[type="submit"], .btn')) {
    const rect = el.getBoundingClientRect();
    candidates.push({
      bottom: rect.bottom + scrollTop,
      width: rect.width,
      height: rect.height,
      rendered: el.offsetParent !== null,
    });
  }
  const anchored = pickButtonAnchor(candidates);
  if (anchored !== null) return anchored;

  let lowest = 0;
  for (const el of doc.querySelectorAll("body *")) {
    if (el.childElementCount > 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) continue;
    if (view && view.getComputedStyle(el).visibility === "hidden") continue;
    // Same `scrollTop` correction as the button branch above. It was missing
    // here, which left one function computing two different coordinate spaces —
    // harmless only for as long as the correction was silently zero.
    const bottom = rect.bottom + scrollTop;
    if (bottom > lowest) lowest = bottom;
  }
  if (lowest > 0) return lowest;
  return Math.max(
    doc.documentElement ? doc.documentElement.scrollHeight : 0,
    doc.body ? doc.body.scrollHeight : 0,
  );
}

export interface CatalystIframeAutosizeOptions {
  /**
   * Called with the frame's document each time one loads, BEFORE the first
   * measurement — so anything it changes is reflected in the height. Used to
   * apply EDC's theme (catalyst-iframe-theme.ts). Must not throw; failures are
   * swallowed so a styling problem can never break sizing.
   */
  onDocument?: (doc: Document, iframe: HTMLIFrameElement) => void;
}

/**
 * Starts watching `slot` for the SDK's iframe and keeps its height in sync
 * with the content. Returns a cleanup that detaches every observer.
 */
export function attachCatalystIframeAutosize(
  slot: HTMLElement,
  options: CatalystIframeAutosizeOptions = {},
): () => void {
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
    const fits = next >= wanted;
    const root = doc.documentElement as unknown as { style?: CSSStyleDeclaration };
    if (root.style) {
      root.style.overflow = fits ? "hidden" : "";
    }

    if (Math.abs(next - iframe.getBoundingClientRect().height) > 2) {
      // Animated so a step change reads as the panel breathing rather than
      // snapping. Timed to match the stylesheet's own 0.22s step cross-fade;
      // `setProperty(..., "important")` because the Tailwind arbitrary variants
      // on the slot set !important on the iframe's own box properties.
      iframe.style.setProperty(
        "transition",
        "height 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "important",
      );
      iframe.style.setProperty("height", `${next}px`, "important");
    }

    // Put the frame back at the top. Catalyst focuses the step's field as soon as
    // it renders it, and the browser scrolls the frame's own viewport to reveal
    // it — the frame is deliberately shorter than Zoho's document (it clips the
    // orphan tail below the button), so there is always range to scroll. With
    // `overflow: hidden` on the root nothing can scroll it back, so the top of
    // the form stays cut off for good: measured on the deployed password step at
    // `scrollY: 16`, which sliced 6px off the top of the "<email> / Change" row —
    // its border and rounded corners with it. The email-OTP step had it worse at
    // 40, where it swallowed the "OTP sent to …" banner whole.
    //
    // Fixing the measurement alone does NOT recover this, which is why both
    // halves are here. A correct measurement grows the frame from 232 to 248, but
    // the content is 268, so 16 remains a legal scroll position and the browser
    // has no reason to leave it.
    //
    // AFTER the height write above, deliberately: a step that grows would
    // otherwise spend a frame at the old height with the scroll already at zero,
    // which is long enough to flash a clipped button. It is outside that `if`
    // just as deliberately — the height is often already correct while the scroll
    // still needs undoing, and that case is the reported bug.
    //
    // Gated on `fits`, the same predicate as hiding the child's scrollbar above
    // and for the mirror-image reason: when the frame holds everything we meant
    // to show, any offset is hiding content and belongs at zero; when the
    // measurement had to be clamped the overflow is real, the scrollbar stays,
    // and the reader's scroll position is theirs to keep. Verified against the
    // live form that this never fights the browser — once the document sits at
    // zero with a correctly sized frame, focusing a field does not re-scroll it.
    if (fits) doc.defaultView?.scrollTo(0, 0);
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

  // Undoes the anti-flash gate below. Deliberately `opacity` and not
  // `visibility`: measureContent reads the child's computed `visibility`, and
  // opacity also keeps the frame in layout so the first measurement is real.
  const reveal = (iframe: HTMLIFrameElement): void => {
    iframe.style.opacity = "";
  };

  /**
   * Theme, then measure — in that order, since restyling changes the content
   * height and the theme goes into <head>, which the body MutationObserver
   * cannot see.
   */
  const themeAndMeasure = (iframe: HTMLIFrameElement): void => {
    if (stopped) return;
    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch {
      // Cross-origin hop (federated/social sign-in): nothing to theme, and
      // leaving it hidden would strand the user.
      reveal(iframe);
      return;
    }
    if (doc && options.onDocument) {
      try {
        options.onDocument(doc, iframe);
      } catch {
        // Cosmetic by definition — never let it stop the sizing below.
      }
    }
    reveal(iframe);
    applyHeight(iframe);
    // A webfont swap changes metrics without mutating the DOM, so the observer
    // is blind to it; this is the only hook that catches the reflow.
    doc?.fonts?.ready
      .then(() => applyHeight(iframe))
      .catch(() => {
        /* the font never resolved; the settle timers still cover it */
      });
  };

  const wire = (iframe: HTMLIFrameElement): void => {
    // "Forgot Password?" navigates this same iframe, so re-theme and re-measure
    // per load.
    const onLoad = (): void => {
      themeAndMeasure(iframe);
      watchDocument(iframe);
      for (const delay of SETTLE_DELAYS_MS) {
        timers.push(window.setTimeout(() => applyHeight(iframe), delay));
      }
    };
    iframe.addEventListener("load", onLoad);
    cleanups.push(() => iframe.removeEventListener("load", onLoad));

    // "Forgot Password?" navigates the frame's inner document by script rather
    // than by setting `src` in a way that reliably re-fires `load` in every
    // browser (established in the sibling Customer-Insight-Engine project).
    // Watching the attribute directly is what guarantees the recovery page gets
    // themed and measured too — on `load` alone it renders with Zoho's own
    // light reset, which is black-on-dark and unreadable.
    const srcObserver = new MutationObserver(() => {
      // Next tick: the attribute changes before the new document is swapped in.
      timers.push(window.setTimeout(() => onLoad(), 0));
    });
    srcObserver.observe(iframe, { attributes: true, attributeFilter: ["src"] });
    cleanups.push(() => srcObserver.disconnect());

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
    // Hide Zoho's unstyled white panel for the frame or two before the theme
    // lands. The unconditional timer is the important half: if theming never
    // runs — a Zoho rename, a cross-origin hop, an exception — the form must
    // still become visible. Fail open, always.
    iframe.style.opacity = "0";
    timers.push(window.setTimeout(() => reveal(iframe), REVEAL_FALLBACK_MS));
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
