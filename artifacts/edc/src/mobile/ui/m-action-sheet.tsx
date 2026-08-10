import type { LucideIcon } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useBackDismiss } from "@/mobile/ui/use-back-dismiss";
import { haptic } from "@/mobile/lib/haptics";

export interface MAction {
  id: string;
  label: string;
  /** One line under the label — say the consequence, not the mechanism. */
  detail?: string;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * The iOS action sheet: a short grouped list of choices, with Cancel set apart.
 *
 * Distinct from MSheet on purpose. MSheet is a surface you read; this is a
 * decision you make and leave. It has no snap points and no drag-to-resize,
 * because resizing a list of four choices is a gesture with nothing to do.
 *
 * Cancel is a SEPARATE group rather than a fifth row. The gap is what makes it
 * unmistakable at thumb speed, and on a destructive choice that separation is
 * the difference between a confirmation and a menu.
 *
 * A title is always required even when nothing is shown, because a sheet that
 * asks a question without stating it is unusable with a screen reader — and
 * because writing the question down usually reveals whether the sheet should
 * exist at all.
 */
export function MActionSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
  cancelLabel = "Cancel",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  actions: MAction[];
  cancelLabel?: string;
}) {
  useBackDismiss(open, () => onOpenChange(false));

  const close = () => onOpenChange(false);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          "m-shell m-sheet border-border",
          "[&>div:first-child]:mt-2.5 [&>div:first-child]:h-1.5 [&>div:first-child]:w-9",
          "[&>div:first-child]:bg-foreground [&>div:first-child]:opacity-25",
        )}
      >
        <div className="px-4 pb-2 pt-3 text-center">
          <DrawerTitle className="m-headline">{title}</DrawerTitle>
          {description ? (
            <DrawerDescription className="m-caption m-muted mt-1">{description}</DrawerDescription>
          ) : null}
        </div>

        <div className="px-3 pb-3">
          <ul className="m-card overflow-hidden">
            {actions.map((action, i) => {
              const Icon = action.icon;
              return (
                <li key={action.id} className={cn(i > 0 && "border-t border-border")}>
                  <button
                    type="button"
                    disabled={action.disabled}
                    onClick={() => {
                      if (action.disabled) return;
                      haptic();
                      action.onSelect();
                      close();
                    }}
                    className={cn(
                      "m-tap m-press flex w-full items-center gap-3 px-4 py-3 text-left",
                      action.destructive && "text-destructive",
                      action.disabled && "opacity-40",
                    )}
                  >
                    {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="m-headline block truncate">{action.label}</span>
                      {action.detail ? (
                        <span className="m-caption m-muted block">{action.detail}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Its own group, with air above it. */}
          <button
            type="button"
            onClick={close}
            className="m-card m-tap m-press mt-2 flex w-full items-center justify-center px-4 py-3"
          >
            <span className="m-headline">{cancelLabel}</span>
          </button>
        </div>

        <div className="pb-[env(safe-area-inset-bottom)]" />
      </DrawerContent>
    </Drawer>
  );
}
