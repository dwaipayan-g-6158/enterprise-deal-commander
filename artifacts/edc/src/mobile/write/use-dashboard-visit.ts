import { useEffect, useRef, useState } from "react";
import { useDashboardVisit } from "@workspace/api-client-react";
import { MOBILE_WRITE_OPTIONS } from "@/mobile/write/write-options";

/**
 * The visit ping, and the "since you were last here" timestamp it returns.
 *
 * The ONLY module permitted to import `useDashboardVisit`.
 *
 * Not one of the four field actions: it writes only the caller's own
 * last-visited timestamp, and it is on the server's own
 * READER_WRITE_METHOD_ALLOWLIST so a read-only user may perform it. It is
 * allowlisted explicitly rather than tolerated, which makes it a decision
 * somebody made rather than an oversight nobody caught.
 *
 * ## Fired once per mount, guarded by a ref
 *
 * The POST returns the PREVIOUS visit time and then stamps a new one. Fire it
 * twice and the second call returns the timestamp the first one just wrote —
 * "since your last visit" collapses to nothing, permanently, and the Command
 * Center's whole movement block goes empty. Under StrictMode's double-invoked
 * effects that happens on every single mount in development.
 */
export function useDashboardVisitOnce(): { previousVisitAt: string | null; ready: boolean } {
  const mutation = useDashboardVisit({ mutation: MOBILE_WRITE_OPTIONS });
  const firedRef = useRef(false);
  const [previousVisitAt, setPreviousVisitAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    mutation
      .mutateAsync()
      .then((response) => {
        // Unwrapped, unlike most endpoints in this client — DashboardVisitResponse
        // carries previousVisitAt directly rather than inside a `data` envelope.
        setPreviousVisitAt(response?.previousVisitAt ?? null);
      })
      .catch(() => {
        // A failed ping is not worth telling anyone about: the only cost is that
        // the "since last visit" rule does not draw, and the screen reads fine
        // without it. Offline, this is the expected outcome.
      })
      .finally(() => setReady(true));
    // Deliberately empty: this must not re-run when the mutation object changes
    // identity between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { previousVisitAt, ready };
}
