/**
 * Asks the browser to stop evicting this origin's storage.
 *
 * ## Why a PWA needs this and a tab does not
 *
 * Storage granted to a normal site is "best-effort": the browser may clear it
 * under pressure, and **iOS clears it after roughly seven days without a
 * visit**. That policy is aimed at trackers, but an installed PWA is caught by
 * it too — and a deal cockpit opened weekly is exactly the usage pattern that
 * trips it. What goes when it fires is the whole Workbox precache and every
 * cached API read, so the next launch is a cold, online-only one: no shell, no
 * last-synced data, and no explanation.
 *
 * `navigator.storage.persist()` opts out. On Chromium it is granted silently to
 * an installed app with engagement; Safari has historically ignored it, so this
 * is an improvement where it works and a no-op where it does not — never a
 * prompt the user has to answer.
 *
 * ## Called once, after sign-in
 *
 * Asking before there is anything worth keeping is what makes some browsers
 * show a permission prompt, so this runs from the shell — which mounts only
 * behind the auth guard — rather than at boot. `persisted()` is checked first
 * so a repeat visit does not re-ask.
 *
 * Every call is guarded and failures are swallowed: this is a durability
 * optimisation, and an origin that refuses it must still run normally.
 */
export async function requestPersistentStorage(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "granted";
    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch {
    // Safari private browsing throws here rather than returning false.
    return "unsupported";
  }
}
