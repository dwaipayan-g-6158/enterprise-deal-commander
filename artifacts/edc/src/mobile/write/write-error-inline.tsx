import { AlertTriangle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WriteOutcome } from "@/mobile/write/write-outcome";

/**
 * A failed write, reported where it happened.
 *
 * In place rather than as a toast, for two reasons that both matter. The shared
 * `<Toaster/>` renders outside `.m-shell`, so it paints in desktop tokens on a
 * phone; and a toast leaves the reader looking at a control whose state is now a
 * lie, with the explanation somewhere else on screen and about to disappear.
 * Putting the message under the control that failed keeps the two together.
 *
 * `role="alert"` because this is the result of something the reader just did and
 * has to hear about, not ambient status.
 */
export function WriteErrorInline({
  outcome,
  onRetry,
  className,
}: {
  outcome: WriteOutcome | null;
  onRetry?: () => void;
  className?: string;
}) {
  if (!outcome) return null;

  const Icon = outcome.kind === "offline" ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        "mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2",
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="m-caption text-destructive">{outcome.message}</p>
        {outcome.retryable && onRetry ? (
          <button type="button" onClick={onRetry} className="m-label m-press mt-1 text-destructive underline">
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
