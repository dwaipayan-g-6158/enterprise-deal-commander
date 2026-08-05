import { useEffect } from "react";
import { useCommander, type JumpTarget } from "@/mobile/commander/commander-context";

/**
 * Publishes this screen's jump targets to the Commander capsule for as long as
 * the screen is mounted, and clears them on the way out so the capsule never
 * offers to scroll to a section that isn't there any more.
 *
 * Callers must memoize `targets` (or build it from stable values) — an array
 * rebuilt every render would re-publish on every render.
 */
export function useJumpTargets(targets: JumpTarget[]): void {
  const { setJumpTargets } = useCommander();

  useEffect(() => {
    setJumpTargets(targets);
    return () => setJumpTargets([]);
  }, [targets, setJumpTargets]);
}
