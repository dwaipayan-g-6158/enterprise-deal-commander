import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCanWrite } from "@/lib/auth/role-context";

const DEFAULT_REASON = "Read-only access — ask an admin to make this change.";

/**
 * The hide primitive. Use for anything that creates or destroys a record and
 * for Save/Apply buttons whose fields are already inert.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const canWrite = useCanWrite();
  return canWrite ? <>{children}</> : null;
}

/**
 * Wraps an already-disabled control so hovering or tab-focusing it explains
 * why. InfoTooltip can't do this: it hardcodes an Info icon as its own
 * trigger (info-tooltip.tsx) rather than accepting one.
 *
 * The <span> is load-bearing. A disabled control never dispatches pointer
 * events, so Radix needs a real enabled element as the trigger.
 * `[&>*]:pointer-events-none` lets the pointer fall through to that span —
 * shadcn's Button already sets `disabled:pointer-events-none`, but Inputs and
 * Selects do not. `tabIndex={0}` keeps the explanation reachable by keyboard,
 * since disabled elements are removed from the tab order.
 *
 * No TooltipProvider here — App.tsx mounts one above the whole router.
 *
 * For admins it returns children untouched with no wrapper element, so it
 * can never perturb a flex or grid layout for the people who can actually
 * write.
 */
export function ReadOnlyTooltip({
  children,
  reason = DEFAULT_REASON,
  className,
}: {
  children: ReactNode;
  reason?: string;
  className?: string;
}) {
  const canWrite = useCanWrite();
  if (canWrite) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "inline-flex rounded-md [&>*]:pointer-events-none",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The read-only counterpart to GuardrailNotice — one honest line explaining
 * why a panel has no controls, in the same icon + title + body shape.
 *
 * Unlike GuardrailNotice, this self-gates. Read-only is ambient global state
 * (not per-deal data the caller already holds), so making every call site
 * write `{!canWrite && <Notice/>}` would be N chances to invert the test.
 * Callers write one unconditional line instead.
 */
export function ReadOnlyNotice({
  children = "You can see everything on this page, but only an admin can change it.",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const canWrite = useCanWrite();
  if (canWrite) return null;

  return (
    <div className={cn("flex gap-2 rounded-md border border-border bg-muted/40 p-3", className)}>
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold text-foreground">Read-only</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
