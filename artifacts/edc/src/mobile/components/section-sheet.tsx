import type { ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/**
 * The mobile shell's one overlay surface. Secondary content — a metric's
 * drill-down, a card peek, the Commander's search — arrives as a bottom sheet
 * you can drag, never a full-screen page jump, so the reader never loses
 * their place.
 *
 * The `m-shell` class is repeated here because vaul portals to <body>, outside
 * the shell's own subtree: without it the sheet renders with the desktop
 * tokens and looks like a different application.
 *
 * Snap points are 55% and 92% — a peek that leaves the underlying screen
 * visible, and a full read. Dragging between them, and the fling-to-dismiss,
 * are vaul's own physics, and its snap curve is already the Apple sheet
 * easing this shell uses elsewhere as --m-ease-standard.
 */
export function SectionSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Screen-reader context. Pass a string even when nothing is shown visually. */
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          "m-shell m-sheet max-h-[92dvh] rounded-t-xl border-border",
          // DrawerContent's first child is vaul's grabber, and the shared
          // component's version is a 100x8 bar in a desktop token. Restyled
          // here rather than there so no desktop drawer changes: iOS sizes it
          // at roughly 36x5 and tints it from the shell's own keyline.
          "[&>div:first-child]:mt-2.5 [&>div:first-child]:h-1.5 [&>div:first-child]:w-9",
          "[&>div:first-child]:bg-muted-foreground [&>div:first-child]:opacity-40",
          className,
        )}
      >
        <div className="px-4 pb-2 pt-3">
          <DrawerTitle className="m-headline">{title}</DrawerTitle>
          {description ? (
            <DrawerDescription className="m-caption m-muted mt-1">
              {description}
            </DrawerDescription>
          ) : null}
        </div>
        {/* The sheet's own scroll area. The bottom padding folds the home
            indicator inset into the normal gutter — two separate padding
            utilities would just overwrite each other. */}
        <div className="overflow-y-auto overscroll-y-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
