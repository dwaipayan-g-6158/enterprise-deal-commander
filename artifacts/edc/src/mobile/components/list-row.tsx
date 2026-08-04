import type { ReactNode } from "react";
import { Link } from "wouter";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { cn } from "@/lib/utils";

/**
 * One row in a list.
 *
 * Six of these were hand-rolled — critical alerts, stalled deals, recent
 * activity, slowest-against-benchmark, similar deals, and the Commander
 * sheet's own rows — and each had invented its own gaps, truncation and
 * right-column alignment. They didn't agree, and on a phone a list that
 * doesn't agree with the list above it is the thing that reads as amateur.
 *
 * Built on shadcn's `Item`, which supplies the slots, the focus ring and
 * `asChild`; this decides the mobile spacing and type once so the six call
 * sites stay readable. Rows stay inside the caller's own `<ul>`/`<li>` rather
 * than moving to `ItemGroup` — native list semantics beat a `role="list"`
 * div, and `ItemGroup` doesn't mark its children as list items anyway.
 *
 * Alignment is `items-baseline`: a flex column's baseline is its first line's,
 * so the trailing figure sits on the title's baseline however many lines the
 * content runs to. `items-center` would float it against a two-line row.
 */
export function ListRow({
  href,
  onPress,
  onClick,
  media,
  title,
  sub,
  body,
  trailing,
  ariaLabel,
  className,
}: {
  /** Renders the row as a link. Mutually exclusive with `onPress`. */
  href?: string;
  onPress?: () => void;
  /** Fires alongside navigation — arming a shared-element morph, usually. */
  onClick?: () => void;
  /** A dot or icon ahead of the title. Centred rather than baselined. */
  media?: ReactNode;
  title: ReactNode;
  /** One line under the title: an account, a stage, an actor. */
  sub?: ReactNode;
  /** Prose under the title. Clamped to two lines by `ItemDescription`. */
  body?: ReactNode;
  /** The right column: a value, a delta, a timestamp. */
  trailing?: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  const interactive = href != null || onPress != null;

  const content = (
    <>
      {media ? <ItemMedia className="w-4 translate-y-0 self-center">{media}</ItemMedia> : null}
      <ItemContent className="gap-0.5">
        {/* ItemTitle is a flex row by default, and text-overflow needs a block
            container — so `truncate` on it alone would do nothing. */}
        <ItemTitle className="m-headline block w-full min-w-0 truncate">{title}</ItemTitle>
        {sub ? <ItemDescription className="m-caption truncate">{sub}</ItemDescription> : null}
        {body ? <ItemDescription className="m-body">{body}</ItemDescription> : null}
      </ItemContent>
      {trailing ? (
        <ItemActions className="m-caption m-muted shrink-0">{trailing}</ItemActions>
      ) : null}
    </>
  );

  const shape = cn(
    "items-baseline gap-3 px-0 py-2",
    interactive && "m-press m-tap",
    className,
  );

  if (href != null) {
    return (
      <Item asChild size="sm" className={shape}>
        <Link href={href} onClick={onClick} aria-label={ariaLabel}>
          {content}
        </Link>
      </Item>
    );
  }

  if (onPress != null) {
    return (
      <Item asChild size="sm" className={cn(shape, "w-full text-left")}>
        <button type="button" onClick={onPress} aria-label={ariaLabel}>
          {content}
        </button>
      </Item>
    );
  }

  return (
    <Item size="sm" className={shape}>
      {content}
    </Item>
  );
}
