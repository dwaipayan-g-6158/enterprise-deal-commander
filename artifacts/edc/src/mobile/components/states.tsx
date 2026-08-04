import type { ReactNode } from "react";
import { CloudOff, Inbox } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Empty and error states, on shadcn's `Empty`.
 *
 * Both say what happened and what to do about it. An empty screen is an
 * invitation, not a shrug, and an error explains the situation without
 * apologising for it. The copy is unchanged — this is a structural move, not
 * a rewrite.
 *
 * `EmptyMedia variant="icon"` gives the glyph a filled plate instead of
 * leaving it floating as loose grey line-art, which is what made the
 * hand-rolled version read as an accident rather than a state.
 */

function StateBlock({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    // Empty's own `md:p-12` never fires inside the mobile shell and its
    // `border-dashed` carries no border-width, so both are inert here; the
    // padding below is what actually applies.
    <Empty className="px-6 py-14">
      <EmptyHeader className="gap-1.5">
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle className="m-title">{title}</EmptyTitle>
        <EmptyDescription className="m-body max-w-[17rem]">{body}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return <StateBlock icon={<Inbox />} title={title} body={body} action={action} />;
}

export function ErrorState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return <StateBlock icon={<CloudOff />} title={title} body={body} action={action} />;
}
