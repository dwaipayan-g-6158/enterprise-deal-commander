/**
 * Is this the installed app rather than a browser tab?
 *
 * Two checks, because iOS predates the standard one: `display-mode:
 * standalone` is what the manifest asks for and what every modern engine
 * reports, and `navigator.standalone` is Safari's own boolean, which is still
 * the only signal on older iOS versions.
 *
 * Used to gate chrome that only makes sense with no browser UI around it —
 * a launch overlay in a tab reads as a stray modal, not a splash screen.
 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}
