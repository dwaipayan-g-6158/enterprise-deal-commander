import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShellScrollRef } from "@/mobile/shell/mobile-shell";
import { useCommander } from "@/mobile/commander/commander-context";

/** Scroll travel that has to accumulate before the capsule changes state. */
const HYSTERESIS_PX = 24;

/** Label per surface. The capsule says what it will do here, not what it is. */
function labelFor(path: string, hasJumpTargets: boolean): string {
  if (path.startsWith("/deals/")) return hasJumpTargets ? "Navigate deal" : "Search or jump";
  if (path === "/deals") return "Filter & find";
  if (path.startsWith("/analytics")) return "Jump to metric";
  return "Search or jump";
}

/**
 * The Commander capsule: one thumb-zone control that morphs with context.
 *
 * It collapses to a circle while you scroll down and re-expands when you stop
 * or scroll back, so it stays reachable without covering the row you're
 * reading. On the deal screen it offers section jumps; elsewhere it opens
 * search.
 *
 * It is hidden on Memory, where the docked search input already owns the thumb
 * zone, and while the sheet itself is open.
 */
export function CommanderButton() {
  const [path] = useLocation();
  const scrollRef = useShellScrollRef();
  const { open, setOpen, jumpTargets } = useCommander();
  const [collapsed, setCollapsed] = useState(false);

  const lastYRef = useRef(0);
  const frameRef = useRef<number | null>(null);

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
        setCollapsed(travelled > 0 && y > 96);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [scrollRef]);

  // Reset on navigation: a new screen starts at the top.
  useEffect(() => {
    setCollapsed(false);
    lastYRef.current = 0;
  }, [path]);

  if (path.startsWith("/memory") || open) return null;

  const label = labelFor(path, jumpTargets.length > 0);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={label}
      className={cn(
        // m-vt-commander: like the tab bar, the capsule holds still while the
        // screen changes behind it.
        "m-press m-vt-commander absolute bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-40",
        "flex h-14 -translate-x-1/2 items-center justify-center gap-2 rounded-full",
        // The inset highlight along the top edge is the same specular the
        // glass chrome carries, so the capsule reads as the same material
        // rather than a solid pill sitting on top of it.
        "bg-[var(--m-obsidian)] text-white",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.16),0_8px_24px_rgba(0,0,0,0.28)]",
        "ring-1 ring-[var(--m-obsidian-ring)] backdrop-blur-xl backdrop-saturate-150",
        // Width is the morph. Transitioning width (not transform) keeps the
        // label crisp; a scaled capsule renders blurry text mid-animation.
        "transition-[width,padding] duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
        collapsed ? "w-14 px-0" : "px-6",
      )}
    >
      <Command className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap font-mono text-sm transition-opacity duration-150",
          collapsed ? "w-0 opacity-0" : "opacity-90",
        )}
        aria-hidden={collapsed}
      >
        {label}
      </span>
    </button>
  );
}
