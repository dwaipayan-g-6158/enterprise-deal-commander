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
  titleLines = 1,
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
  /**
   * How many lines the title may run to before it is clamped.
   *
   * One is right for a row whose trailing column is the point (a value, a
   * delta), where the title is a label. Two is right when the title IS the
   * content and the trailing column is a hint — a one-line clamp there spends
   * the row's information on the least important thing in it.
   */
  titleLines?: 1 | 2;
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
      {/* `min-w-0` is load-bearing, and its absence was VISIBLE on the deployed
          app. shadcn's ItemContent is `flex flex-1 flex-col` with no min-width
          override, so it inherits a flex item's default `min-width: auto` and
          cannot shrink below its own min-content width. With a `nowrap` title
          that min-content width is the WHOLE title, so the column grew to 1003px
          inside a 390px phone: on the deal Brief the coaching titles painted
          straight off the right edge of the card and the screen, and on the
          Command Center the row wrapped instead, dropping the icon and the
          trailing destination onto their own lines. `truncate` on the title
          could not save either case — text-overflow only ellipsises a box that
          something has constrained, and nothing was constraining this one. */}
      <ItemContent className="min-w-0 gap-0.5">
        {/* ItemTitle is a flex row by default, and text-overflow needs a block
            container — so `truncate` on it alone would do nothing. */}
        <ItemTitle
          className={cn(
            "m-headline block w-full min-w-0",
            titleLines === 2 ? "line-clamp-2" : "truncate",
          )}
        >
          {title}
        </ItemTitle>
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
