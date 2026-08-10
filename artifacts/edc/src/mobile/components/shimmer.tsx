import { cn } from "@/lib/utils";

/**
 * Loading placeholder. A shimmer rather than a spinner: it occupies the exact
 * geometry of the content it stands in for, so the swap to real data is
 * additive instead of a layout jump.
 *
 * The sweep is removed outright under prefers-reduced-motion (mobile.css) —
 * the global reduced-motion rule clamps durations to 0.01ms, which would turn
 * it into a strobe.
 */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("m-skeleton", className)} aria-hidden="true" />;
}

/** A block of shimmer lines, for text-shaped placeholders. */
export function ShimmerLines({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        // Final line runs short, the way a real paragraph's does.
        <Shimmer key={i} className={cn("h-3.5", i === lines - 1 && "w-2/3")} />
      ))}
    </div>
  );
}
