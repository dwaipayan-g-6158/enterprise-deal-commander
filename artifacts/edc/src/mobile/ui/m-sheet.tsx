import type { ReactNode } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { useBackDismiss } from "@/mobile/ui/use-back-dismiss";

/**
 * The shell's overlay surface. Secondary content — a drill-down, a filter set,
 * the Commander's search — arrives as a bottom sheet you can drag, never a
 * full-screen page jump, so the reader never loses their place.
 *
 * `.m-shell` is repeated on the content because vaul portals to <body>, outside
 * the shell's subtree: without it the sheet renders in DESKTOP tokens and looks
 * like a different application. `.m-sheet` then re-declares background-image,
 * which is what stops the ambient sky being repainted across the sheet's top
 * edge by that same re-application.
 *
 * Snap points are a peek that leaves the underlying screen visible and a full
 * read. Dragging between them and the fling-to-dismiss are vaul's own physics,
 * and its snap curve is already the Apple sheet easing used elsewhere as
 * --m-ease-standard.
 *
 * The back gesture closes it — see useBackDismiss for why that needs history
 * and why it is not optional on Android.
 */
export function MSheet({
  open,
  onOpenChange,
  title,
  description,
  /** Hide the title visually while keeping it for assistive tech. */
  hideTitle = false,
  snapPoints,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Screen-reader context. Pass a string even when nothing is shown visually. */
  description?: string;
  hideTitle?: boolean;
  snapPoints?: (string | number)[];
  children: ReactNode;
  /** Pinned below the scroll area — a confirm button, usually. */
  footer?: ReactNode;
  className?: string;
}) {
  useBackDismiss(open, () => onOpenChange(false));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={snapPoints}>
      <DrawerContent
        className={cn(
          "m-shell m-sheet max-h-[94dvh] border-border",
          // DrawerContent's first child is vaul's grabber, and the shared
          // component's version is a 100x8 bar in a desktop token. Restyled here
          // rather than there so no desktop drawer changes: iOS sizes it at
          // roughly 36x5 and tints it from the shell's own foreground.
          "[&>div:first-child]:mt-2.5 [&>div:first-child]:h-1.5 [&>div:first-child]:w-9",
          "[&>div:first-child]:bg-foreground [&>div:first-child]:opacity-25",
          className,
        )}
      >
        <div className={cn("px-4 pb-2 pt-3", hideTitle && "sr-only")}>
          <DrawerTitle className="m-headline">{title}</DrawerTitle>
          {description ? (
            <DrawerDescription className="m-caption m-muted mt-1">{description}</DrawerDescription>
          ) : null}
        </div>

        {/* The sheet's own scroll area. The bottom padding folds the home
            indicator inset into the normal gutter — two separate padding
            utilities would just overwrite each other. */}
        <div
          className={cn(
            "overflow-y-auto overscroll-y-contain px-4",
            footer ? "pb-3" : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          {children}
        </div>

        {footer ? (
          <div className="border-t border-border px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
