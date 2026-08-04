import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey, type AuthUser } from "@workspace/api-client-react";

export interface AuthGuardState {
  /** undefined while offline (or still resolving) — /auth/me is neither reachable nor cached. */
  user: AuthUser | undefined;
  offline: boolean;
  /**
   * True while the session is unresolved and the caller should render a
   * skeleton instead of the app. Always false offline: offline is a decision,
   * not a pending state, so the shell renders immediately over cached reads.
   */
  pending: boolean;
}

/**
 * Session guard shared by both shells (desktop and mobile). Redirects to
 * /login when the session is gone, and reports whether the caller should
 * render its own loading chrome.
 *
 * /auth/me is deliberately never cached (auth must hit the network), so when
 * offline the session check can't succeed. Disable it while offline — that
 * avoids a request storm AND lets us keep showing the app shell + cached
 * reads instead of bouncing to /login. When connectivity returns the query
 * re-enables, re-validates, and redirects if the session is actually gone.
 * (Logout purges the read cache, so a logged-out user still sees nothing.)
 */
export function useAuthGuard(): AuthGuardState {
  const [, setLocation] = useLocation();
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const { data: user, isLoading, isError } = useGetMe({
    query: { enabled: !offline, queryKey: getGetMeQueryKey() },
  });

  useEffect(() => {
    if (!offline && !isLoading && (isError || !user)) {
      setLocation("/login");
    }
  }, [offline, isLoading, isError, user, setLocation]);

  // Pending covers both "still loading" and "resolved to no session": in the
  // latter case the redirect effect above has fired but hasn't committed yet,
  // and rendering the skeleton rather than null avoids one blank white commit.
  const pending = !offline && (isLoading || isError || !user);

  return { user, offline, pending };
}
