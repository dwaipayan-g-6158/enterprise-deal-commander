import { useLocation } from "wouter";
import { ListTree, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommander } from "@/mobile/commander/commander-context";
import { hidesCommander } from "@/mobile/nav/mobile-nav";
import { useWriteStatusOptional } from "@/mobile/write/write-status-context";

interface Affordance {
  label: string;
  Icon: LucideIcon;
  /** Secondary material — see .m-capsule-quiet. */
  quiet: boolean;
}

/**
 * What the capsule does here, said three ways — label, glyph, and material.
 *
 * It used to draw lucide's `Command`, the Apple *keyboard* key, on a device
 * with no keyboard; the capsule is not a command palette on a phone and should
 * not wear its shortcut.
 *
 * ## Driven by what the screen registered, not by its path
 *
 * The variants used to be chosen by pathname, and two of the four branches were
 * unreachable: `/deals` bails in `hidesCommander` before this is called, and
 * `hasJumpTargets` was permanently false because `useJumpTargets` had no call
 * sites anywhere. The visible consequence was on `/analytics`, where the label
 * read "Jump to metric" over a sheet that could not jump to anything — the
 * "On this screen" group it needed was fed by that same dead hook. It opened
 * the identical sheet as "Search or jump", drawn in the identical pill, which
 * is exactly what it was reported as.
 *
 * Now a screen earns the jump affordance by registering targets. A screen that
 * registers none gets the search capsule, and the label is true either way.
 */
function affordanceFor(hasJumpTargets: boolean): Affordance {
  return hasJumpTargets
    ? { label: "Jump to section", Icon: ListTree, quiet: true }
    : { label: "Search or jump", Icon: Search, quiet: false };
}

/**
 * The Commander capsule: one thumb-zone control that morphs with context.
 *
 * ## It does not move, and that is the whole design
 *
 * It used to duck downward on any scroll past 24px and come back 420ms after
 * you stopped. The reason was sound — an OPAQUE pill parked over the row you
 * are reading is occlusion, and in the Phase 5 captures it sat across a
 * critical alert on Home and the Playbook card on the deal screen.
 *
 * The pill is not opaque any more. `.m-capsule` is drawn at 0.70 alpha in
 * light and 0.82 in dark over a 24px backdrop blur, so the row underneath is
 * still legible through it and there is nothing to get out of the way of. That
 * exchange is the point: a control that is always exactly where you left it is
 * worth more than one that clears a view you can now see anyway.
 *
 * The alphas are floored by tokens.test.ts's contrast assertions and capped by
 * its MAX_CAPSULE_ALPHA — raise them and the capsule becomes an obstruction
 * that no longer moves, which is the worst of both designs.
 *
 * It is absent entirely on the screens that own their own thumb zone, and
 * while the sheet it opens is open.
 */
export function CommanderButton() {
  const [path] = useLocation();
  const { open, setOpen, jumpTargets } = useCommander();
  const writeStatus = useWriteStatusOptional();

  // Which screens it stays off, and why, lives in nav/mobile-nav.ts so it is
  // testable. It is also hidden while the sheet it opens is open.
  //
  // And while an undo window is open. The undo bar occupies the SAME band —
  // both sat at bottom-[var(--m-float-bottom)] at z-40 — and the capsule is
  // mounted after <main> in the shell, so it painted straight over the undo
  // message on every deal panel. Ceding the corner is the right resolution
  // rather than restacking: two controls fighting for one thumb zone is the
  // defect, the undo window lasts seconds, and undoing the gate you just
  // toggled is by far the more urgent of the two. It also resolves a silent
  // second bug — both elements carry `m-vt-capsule`, and a duplicated
  // view-transition-name disables the transition for BOTH (see motion.css).
  if (open || writeStatus?.undo || hidesCommander(path)) return null;

  const { label, Icon, quiet } = affordanceFor(jumpTargets.length > 0);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={label}
      className={cn(
        // m-vt-capsule: like the tab bar, the capsule holds still while the
        // screen changes behind it.
        "m-press m-vt-capsule absolute bottom-[var(--m-float-bottom)] left-1/2 z-40",
        "flex h-14 items-center justify-center gap-2 px-6",
        // .m-capsule carries the whole material — fill, label colour, pill
        // radius, elevation, specular edge and ring. It is a single class
        // rather than utilities because the fill's POLARITY INVERTS between
        // themes: obsidian on light, bright indigo on dark. A dark pill on a
        // near-black canvas measures 1.01:1 against it and is simply not
        // visible as a shape, so "most prominent" can only mean light there.
        // Hard-coding text-white here would have made the dark label unreadable.
        //
        // The quiet variant swaps that inverted fill for the shell's ordinary
        // glass, so the two states differ by material and not only by glyph.
        quiet ? "m-glass m-capsule-quiet" : "m-capsule",
        // Centring, and it stays a `translate` rather than a `transform` so it
        // composes with .m-press's scale on tap instead of cancelling it — the
        // same trap the scroll-driven reveals hit.
        "-translate-x-1/2",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {/* Full opacity, not the 90% it used to carry. tokens.test.ts measures
          --m-capsule-foreground against the composited pill, so a label that
          ships at 0.9 is not the label that was measured — it lands ~0.5:1
          lower, which was slack on an opaque pill and is margin the dark
          theme no longer has. Softening the label was also the one thing
          making it lighter than the icon beside it. */}
      <span className="m-label whitespace-nowrap">{label}</span>
    </button>
  );
}
