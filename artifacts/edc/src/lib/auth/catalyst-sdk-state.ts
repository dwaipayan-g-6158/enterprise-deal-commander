// Readiness predicate for the Catalyst Web SDK handle, kept as its own pure
// module so it is testable without a DOM (this package's Vitest runs in a
// `node` environment — see vitest.config.ts).

/**
 * True only when the SDK handle can actually render a sign-in form.
 *
 * "The `auth` object exists" is NOT enough, and assuming it was is what made
 * a broken sign-in page look like a blank one. Two scripts have to land for
 * embedded auth to work: the CDN Web SDK, and the platform-served
 * `/__catalyst/sdk/init.js` that carries this project's zaid/projectId. The
 * CDN script alone leaves `auth` present but inert — no project config, no
 * `signIn`. Since `/__catalyst/*` is intercepted by the Catalyst AppSail
 * gateway and exists nowhere else, that half-loaded state is the NORMAL
 * outcome off the deployed domain (localhost 404s it), so it has to be
 * detected rather than treated as success.
 *
 * Deliberately duck-typed on the one capability the caller needs next
 * (`auth.signIn` being callable) instead of probing for config internals,
 * which are undocumented and version-specific.
 */
export function isCatalystSdkReady(candidate: unknown): boolean {
  if (typeof candidate !== "object" || candidate === null) return false;
  const auth = (candidate as { auth?: unknown }).auth;
  if (typeof auth !== "object" || auth === null) return false;
  return typeof (auth as { signIn?: unknown }).signIn === "function";
}
