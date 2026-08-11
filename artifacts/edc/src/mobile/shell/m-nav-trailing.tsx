import { EdcLogoMark } from "@/components/edc-logo-mark";
import { MAvatar } from "@/mobile/shell/m-avatar";

/**
 * How much faster than the desktop sidebar's the mark draws here.
 *
 * The sidebar plays the full 3.22s sequence once per app load and then never
 * again — it is a persistent element, so nothing restarts it. This one lives on
 * a screen, so it replays on every tab switch, and 3.22s is longer than a tab
 * switch. At 2.2 the sequence lands in ~1.46s: the same choreography, finished
 * before the thumb reaches the next tab rather than still drawing when it does.
 *
 * Same value BootSplash uses, and for the same reason — a fixed window it has
 * to finish inside.
 */
const MARK_TIME_SCALE = 2.2;

/**
 * The nav bar's trailing cluster on the four tab roots: the brand mark, then
 * the account avatar.
 *
 * ## The mark animates here, and that reverses an earlier decision
 *
 * command-screen.tsx used to render it static, with a comment giving the
 * reason: "the draw-in belongs to the launch moment (BootSplash), and replaying
 * it every time someone taps Command turns a signature into a tic." That was a
 * real concern and it is worth restating rather than quietly deleting — this is
 * a deliberate reversal, asked for, not an oversight.
 *
 * Two things make it defensible at this size. The mark is 24px in the corner
 * rather than 96px mid-screen, so the draw reads as the chrome waking up rather
 * than as a title card. And the sequence is sped up to finish inside a tab
 * dwell, so it is never caught half-drawn.
 *
 * ## Why it replays at all
 *
 * There is no replay mechanism here and there deliberately isn't one. MShell
 * mounts once, but each screen renders its own MNavBar below it, so navigating
 * unmounts one mark and mounts another — the animation restarts because the
 * component is new, which is also exactly when it should. A reload plays it for
 * the same reason. Anything cleverer would be state tracking a remount already
 * expresses.
 *
 * Reduced motion is handled inside EdcLogoMark: the petals render filled with
 * no draw, no shimmer and no breathe.
 */
export function MNavTrailing() {
  return (
    <div className="flex items-center gap-1">
      <EdcLogoMark size={24} timeScale={MARK_TIME_SCALE} className="shrink-0" />
      <MAvatar />
    </div>
  );
}
