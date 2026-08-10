/**
 * Turning a failed write into something a person can act on.
 *
 * Pure, and separated from the hooks, because the copy is the feature here. A
 * write that fails silently, or that says "something went wrong", is worse on a
 * phone than on a laptop: the reader is standing in a customer's lobby and needs
 * to know whether the thing they just tapped is saved.
 */

export type WriteOutcomeKind =
  | "offline"
  | "forbidden"
  | "guardrail"
  | "conflict"
  | "validation"
  | "server"
  | "unknown";

export interface WriteOutcome {
  kind: WriteOutcomeKind;
  /** One line, stating what is true now — not what the layer did. */
  message: string;
  /** Whether re-submitting the same request could plausibly work. */
  retryable: boolean;
}

interface ApiErrorish {
  status?: number;
  data?: { error?: { code?: string; message?: string; patternCodes?: string[] } };
}

/**
 * Offline is detected from the shape of the failure, not from navigator.onLine.
 *
 * `navigator.onLine` reports whether an interface is up, not whether anything is
 * reachable — it is true on a captive portal, on hotel wifi that has stopped
 * routing, and in a lift. A fetch that rejects with a TypeError and no status is
 * the actual evidence that nothing left the device.
 *
 * This matters more than usual here because the mobile write layer sets
 * `networkMode: "always"` precisely so the request is ATTEMPTED and rejects,
 * rather than being paused by React Query and reported as queued.
 */
export function classifyWriteError(error: unknown): WriteOutcome {
  if (error instanceof TypeError) {
    return {
      kind: "offline",
      message: "Not saved — you're offline. Try again when you have signal.",
      retryable: true,
    };
  }

  const err = (error ?? {}) as ApiErrorish;
  const status = err.status;
  const apiMessage = err.data?.error?.message;
  const code = err.data?.error?.code;

  if (status === 403) {
    return {
      kind: "forbidden",
      message: "You have read-only access, so this wasn't saved.",
      retryable: false,
    };
  }

  if (status === 409) {
    if (code === "STAGE_GUARDRAIL" || (err.data?.error?.patternCodes?.length ?? 0) > 0) {
      return {
        kind: "guardrail",
        message: apiMessage ?? "Blocked by active risk patterns.",
        retryable: false,
      };
    }
    return {
      kind: "conflict",
      message: apiMessage ?? "Someone else changed this first. Reopen to see the current state.",
      retryable: false,
    };
  }

  if (status === 400 || status === 422) {
    return {
      kind: "validation",
      message: apiMessage ?? "That didn't pass validation, so nothing was saved.",
      retryable: false,
    };
  }

  if (status === 401) {
    return { kind: "forbidden", message: "Your session ended. Sign in again.", retryable: false };
  }

  if (typeof status === "number" && status >= 500) {
    return {
      kind: "server",
      message: "The server couldn't save that. Nothing changed — try again.",
      retryable: true,
    };
  }

  return {
    kind: "unknown",
    message: apiMessage ?? "That didn't save. Nothing changed.",
    retryable: true,
  };
}

/**
 * Every message states what is TRUE NOW rather than what failed.
 *
 * "Not saved" is information; "Request failed" is a stack trace with manners.
 * Pinned by a test so a future edit cannot quietly reintroduce the latter, and
 * so nothing ever promises a retry the app does not perform — which is the
 * specific lie `networkMode: "always"` exists to prevent.
 */
export const FORBIDDEN_PHRASES = [
  /\bqueued\b/i,
  /will save automatically/i,
  /\bsyncing\b/i,
  /\bwe'?ll retry\b/i,
];
