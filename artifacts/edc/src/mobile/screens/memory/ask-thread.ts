/**
 * The advisor conversation, held outside React.
 *
 * ## Why it cannot live in the screen
 *
 * On this shell a navigation unmounts the screen. Tapping a citation to read the
 * record it came from and pressing back would discard the whole conversation —
 * which, on a surface whose entire value is asking follow-up questions, makes
 * the feature not worth opening twice. The desktop page lifts this state to the
 * page component for exactly the same reason.
 *
 * A store rather than a context because it is one tab's state, and wrapping the
 * whole shell in a provider for it would be the larger change.
 *
 * The thread is deliberately session-scoped and NOT persisted. An advisor answer
 * is derived from the archive as it stood when it was asked; restoring a
 * week-old conversation on a cold start would present stale conclusions as
 * current ones, with a confidence label attached.
 */

export type AdvisorConfidence = "high" | "medium" | "low" | "none";

export interface ThreadCitation {
  id: string;
  dealName: string;
  accountName: string;
}

export interface ThreadMessage {
  role: "user" | "advisor";
  text: string;
  confidence?: AdvisorConfidence;
  citations?: ThreadCitation[];
}

let thread: ThreadMessage[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeThread(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function askThread(): ThreadMessage[] {
  return thread;
}

export function appendMessage(message: ThreadMessage): void {
  thread = [...thread, message];
  emit();
}

export function clearThread(): void {
  if (thread.length === 0) return;
  thread = [];
  emit();
}
