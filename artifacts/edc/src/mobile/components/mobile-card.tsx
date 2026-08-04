import type { ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

/**
 * A bento module. Every card carries a keyline as well as a shadow — on a
 * near-black canvas a shadow alone is invisible, and cards that dissolve into
 * the background are what makes a dense screen unreadable.
 *
 * `m-reveal` rises the card into place as it crosses into the scrollport,
 * driven entirely by the scroll position rather than a listener. Cards
 * already on screen at load are past the end of their range and render
 * normally, and so does everything on a screen too short to scroll.
 */
export function MobileCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("m-card m-reveal p-4", className)}>{children}</section>;
}

/**
 * The tappable variant. A whole card is the target rather than a link inside
 * it, which is both a bigger thumb target and a clearer affordance.
 */
export function MobileCardLink({
  href,
  children,
  className,
  onLongPress,
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onLongPress?: () => void;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn("m-card m-press m-reveal block p-4 text-left", className)}
      onContextMenu={
        onLongPress
          ? (e) => {
              // Suppress the OS text-selection menu so a long press peeks
              // instead of offering to copy the deal name.
              e.preventDefault();
            }
          : undefined
      }
    >
      {children}
    </Link>
  );
}

/** The label above a module's content. Sentence case — a card should say what
 *  it holds, not announce itself. */
export function CardLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("m-label m-muted", className)}>{children}</p>;
}

/**
 * A module header with an optional trailing action (usually a "View all"
 * link into the fuller list).
 */
export function CardHeader({
  label,
  action,
}: {
  label: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <CardLabel>{label}</CardLabel>
      {action}
    </div>
  );
}
