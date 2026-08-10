/**
 * Options every mobile write is submitted with.
 *
 * Both fields are load-bearing, and both exist to stop a globally-mounted
 * desktop behaviour from doing the wrong thing on a phone.
 */
export const MOBILE_WRITE_OPTIONS = {
  /**
   * React Query's default is "online", which PAUSES a mutation while offline
   * rather than failing it. A paused mutation enters `isPaused`, which is what
   * `components/offline-save-notice.tsx` — mounted globally in App.tsx — watches
   * before telling the reader their change is "queued and will save
   * automatically when you reconnect".
   *
   * The mobile app does not keep that promise. There is no outbox, no replay,
   * and the service worker caches GETs only (both runtimeCaching rules test
   * `request.method === "GET"`), so a write offline reaches nothing and is
   * simply lost when the tab dies.
   *
   * "always" lets the fetch run and reject, so classifyWriteError can say "Not
   * saved — you're offline" and mean it. It also keeps the mutation out of
   * `isPaused`, which is what makes OfflineSaveNotice correctly stay silent.
   */
  networkMode: "always",

  /**
   * One attempt. A retry would re-submit a write whose first attempt may already
   * have landed — the response was lost, not the request — and every action here
   * is non-idempotent enough for that to matter. The reader retries by tapping
   * again, which is a decision rather than a guess.
   */
  retry: 0,

  meta: {
    /**
     * App.tsx installs a MutationCache onError that toasts a read-only
     * explanation on any 403. That toast renders in <Toaster/>, which is a
     * SIBLING of ShellGate and therefore outside `.m-shell` — so it paints in
     * desktop tokens, at desktop radius, in the desktop position, on a phone.
     *
     * Suppressed here and re-rendered in place by write-error-inline.tsx. The
     * corollary, which the allowlist test enforces: the mobile write layer never
     * imports @/hooks/use-toast.
     */
    suppressForbiddenToast: true,
  },
} as const;
