import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ListTree, Search, SlidersHorizontal, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShellScrollRef } from "@/mobile/shell/m-shell";
import { useCommander } from "@/mobile/commander/commander-context";

/** Scroll travel that has to accumulate before the capsule changes state. */
const HYSTERESIS_PX = 24;

/** How long the scroll has to stop before the capsule comes back. */
const SETTLE_MS = 420;

/**
 * What the capsule does here, said twice — once in the label, once in the
 * glyph. It used to draw lucide's `Command`, the Apple *keyboard* key, on a
 * device with no keyboard; the capsule is not a command palette on a phone
 * and should not wear its shortcut.
 */
function affordanceFor(path: string, hasJumpTargets: boolean): { label: string; Icon: LucideIcon } {
  if (path.startsWith("/deals/")) {
    return hasJumpTargets
      ? { label: "Navigate deal", Icon: ListTree }
      : { label: "Search or jump", Icon: Search };
  }
  if (path === "/deals") return { label: "Filter & find", Icon: SlidersHorizontal };
  if (path.startsWith("/analytics")) return { label: "Jump to metric", Icon: Target };
  return { label: "Search or jump", Icon: Search };
}

/**
 * The Commander capsule: one thumb-zone control that morphs with context.
 *
 * It gets out of the way while you scroll down and returns when you stop or
 * scroll back. It used to only shrink to a circle, and a circle parked over
 * the row you are reading is still parked over the row you are reading — in
 * the captures it sat across a critical alert on Home and the Playbook card
 * on the deal screen. It leaves now, and it leaves downward, so the thumb
 * knows where it went.
 *
 * The settle timer is what makes hiding safe: without it, scrolling down and
 * stopping would strand the reader with no way to reach search until they
 * scrolled back up. (The old comment claimed this behaviour; there was no
 * timer behind it.)
 *
 * It is hidden entirely on Memory, where the docked search input already owns
 * the thumb zone, and while the sheet itself is open.
 */
export function CommanderButton() {
  const [path] = useLocation();
  const scrollRef = useShellScrollRef();
  const { open, setOpen, jumpTargets } = useCommander();
  const [hidden, setHidden] = useState(false);

  const lastYRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      // rAF-throttled: scroll fires far more often than a frame can paint, and
      // the capsule only ever changes between two states.
      if (frameRef.current != null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const y = el.scrollTop;
        const travelled = y - lastYRef.current;
        if (Math.abs(travelled) < HYSTERESIS_PX) return;
        lastYRef.current = y;
        // Near the top there is nothing to get out of the way of.
        setHidden(travelled > 0 && y > 96);

        if (settleRef.current) clearTimeout(settleRef.current);
        settleRef.current = setTimeout(() => setHidden(false), SETTLE_MS);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, [scrollRef]);

  // Reset on navigation: a new screen starts at the top.
  useEffect(() => {
    setHidden(false);
    lastYRef.current = 0;
  }, [path]);

  if (path.startsWith("/memory") || open) return null;

  const { label, Icon } = affordanceFor(path, jumpTargets.length > 0);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={label}
      // Out of the tab order and out of the way of a tap while it is gone;
      // opacity alone would leave an invisible target over the content.
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden}
      className={cn(
        // m-vt-capsule: like the tab bar, the capsule holds still while the
        // screen changes behind it.
        "m-press m-vt-capsule absolute bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-40",
        "flex h-14 items-center justify-center gap-2 px-6",
        // .m-capsule carries the whole material — fill, label colour, pill
        // radius, elevation, specular edge and ring. It is a single class
        // rather than utilities because the fill's POLARITY INVERTS between
        // themes: obsidian on light, bright indigo on dark. A dark pill on a
        // near-black canvas measures 1.01:1 against it and is simply not
        // visible as a shape, so "most prominent" can only mean light there.
        // Hard-coding text-white here would have made the dark label unreadable.
        "m-capsule",
        // `translate` rather than `transform`, so it composes with .m-press's
        // scale on tap instead of cancelling it — the same trap the
        // scroll-driven reveals hit.
        "-translate-x-1/2 transition-[translate,opacity] duration-[var(--m-dur-move)] ease-[var(--m-ease-standard)]",
        hidden ? "pointer-events-none translate-y-[calc(100%+1.5rem)] opacity-0" : "translate-y-0",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="m-label whitespace-nowrap opacity-90">{label}</span>
    </button>
  );
}
