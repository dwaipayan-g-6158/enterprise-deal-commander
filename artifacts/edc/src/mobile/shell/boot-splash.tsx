import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { EdcLogoMark } from "@/components/edc-logo-mark";
import { cn } from "@/lib/utils";
import { isStandaloneDisplay } from "@/mobile/lib/standalone";

/** One play per app launch, not per navigation. */
const SESSION_KEY = "edc:boot-played";

/**
 * The mark's own entrance runs 3.22s at timeScale 1; at 2.2 all four petals
 * have drawn and flooded by ~1.38s. The floor is set just past that so the
 * sequence is never cut off mid-petal.
 */
const MARK_TIME_SCALE = 2.2;
const MIN_VISIBLE_MS = 1450;

/**
 * Hard ceiling. The splash dismisses on this regardless of what the network
 * is doing — a slow connection must never be able to hold someone behind a
 * logo, and the screen underneath has its own skeleton to show meanwhile.
 */
const MAX_VISIBLE_MS = 2500;

/** Must match the .m-boot transition duration in motion.css. */
const FADE_MS = 320;

function alreadyPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // Private mode, or storage blocked. Treat as played: a splash that
    // replays on every navigation is worse than one that never shows.
    return true;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * The launch moment.
 *
 * A native app shows its launch screen until it has something to draw; this
 * follows the same contract, dismissing once *both* the mark has finished
 * arriving and the first screen's queries have gone quiet. Whichever is
 * slower decides, with a hard ceiling behind both.
 *
 * It borrows `.m-shell`, so the canvas underneath the mark is the same
 * time-of-day sky the app itself is wearing — the launch screen is warm at
 * dawn and deep blue after dark rather than a flat brand colour.
 *
 * That sky is faded in rather than present from the start, and the reason is
 * the seam above this component: iOS shows a static launch image while the
 * bundle boots, and a static image cannot know the time of day. Both surfaces
 * therefore begin on the flat canvas and the sky blooms afterwards, so the
 * handoff has no colour cut in it. The whole sequence — OS image, bloom, mark,
 * dismiss — reads as one movement rather than three.
 *
 * Three things keep it from being an annoyance: it plays once per app launch,
 * only in the installed app (in a browser tab a full-bleed overlay reads as a
 * stray modal), and not at all under prefers-reduced-motion, where a 1.4s
 * pause buys nothing because there would be nothing to watch.
 */
export function BootSplash() {
  const [phase, setPhase] = useState<"showing" | "leaving" | "hidden">(() =>
    isStandaloneDisplay() && !alreadyPlayed() && !prefersReducedMotion()
      ? "showing"
      : "hidden",
  );
  const [floorElapsed, setFloorElapsed] = useState(false);
  // Any query, including the session check the auth guard fires on mount.
  const inFlight = useIsFetching();
  const leftRef = useRef(false);

  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    setPhase("leaving");
  }, []);

  // Recorded as soon as it starts, not when it finishes: a reload mid-fade
  // should still count as played.
  useEffect(() => {
    if (phase !== "showing") return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Nothing to do — see alreadyPlayed().
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "showing") return;
    const floor = setTimeout(() => setFloorElapsed(true), MIN_VISIBLE_MS);
    const ceiling = setTimeout(leave, MAX_VISIBLE_MS);
    return () => {
      clearTimeout(floor);
      clearTimeout(ceiling);
    };
  }, [phase, leave]);

  useEffect(() => {
    if (phase === "showing" && floorElapsed && inFlight === 0) leave();
  }, [phase, floorElapsed, inFlight, leave]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("hidden"), FADE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div
      // The skeleton underneath already announces the load through its own
      // live region; a second announcement from a purely decorative overlay
      // would just talk over it.
      aria-hidden="true"
      data-leaving={phase === "leaving"}
      className={cn(
        "m-boot m-shell fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 px-8",
        // Released the instant the fade starts, so the app is tappable
        // through the last 320ms rather than after it.
        phase === "leaving" && "pointer-events-none",
      )}
    >
      {/* The sky, on its own layer so it can arrive rather than just be there.
          .m-boot suppresses the shell's own wash and this fades the identical
          gradient stack in over it — see .m-boot-sky in motion.css for why the
          splash has to start on the flat canvas. */}
      <div className="m-boot-sky" />
      <EdcLogoMark size={96} timeScale={MARK_TIME_SCALE} />
      {/* `.m-hero` rather than a hand-rolled caption, and this is the one screen
          where that rung is the right call. The ladder reserves it for "the one
          figure a screen is about, max one per screen" — a launch screen has no
          figure, so the rung is free, and nothing else here competes for it. At
          44px on a 390px canvas the name wraps to three lines and becomes the
          screen rather than a label under a logo.

          It also drops the old uppercase + 0.18em tracking, which existed as a
          logotype exception to a ladder that had no rung big enough. There is one
          now. Sentence case, per type.css's own policy note.

          AppReveal carries the same lockup at `.m-display` for the refresh case;
          the two are never on screen together (see app-reveal.tsx on z-order), so
          they are free to differ in size. */}
      <div className="m-boot-wordmark flex flex-col items-center gap-2 text-center">
        <p className="m-hero text-balance">Enterprise Deal Commander</p>
        <p className="m-body m-muted">Mobile Edition</p>
      </div>
    </div>
  );
}
