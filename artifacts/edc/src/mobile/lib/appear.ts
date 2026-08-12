/**
 * Whether a settled render should fade its content in.
 *
 * The shell already cross-fades a page switch, and it already draws a skeleton
 * while a screen's queries are in flight. What it never animated is the moment
 * BETWEEN those two — the skeleton being replaced by real content. Measured on a
 * Command → Deals switch: the cross-fade delivers a screen holding five shimmer
 * blocks and zero deals, and the deals then appear with no transition at all.
 *
 * Two states must NOT fade, and both are why this is a function rather than
 * `!loading`:
 *
 *  - still loading — there is nothing to fade in yet;
 *  - a first render that was ALREADY settled, i.e. a warm cache. There the route
 *    transition is animating the arrival, so a second animation on top of it
 *    reads as a second load — and on the deal brief it would start the
 *    shared-card morph target at opacity 0 and fly the hero into nothing.
 *
 * Pure and parameterised rather than reading a ref, because vitest runs this
 * package with `environment: "node"` and collects only `*.test.ts` — there is no
 * DOM and no React renderer, so anything that must be verified has to be pure.
 */
export function appearsOnSettle(everLoaded: boolean, loading: boolean): boolean {
  return everLoaded && !loading;
}
