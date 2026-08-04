import type { ReactNode } from "react";
import { CloudOff, Inbox } from "lucide-react";

/**
 * Empty and error states.
 *
 * Both say what happened and what to do about it. An empty screen is an
 * invitation, not a shrug, and an error explains the situation without
 * apologising for it.
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
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="m-muted mb-1" aria-hidden="true">
        {icon}
      </span>
      <p className="m-h3">{title}</p>
      <p className="m-body m-muted max-w-[15rem]">{body}</p>
      {action}
    </div>
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
  return <StateBlock icon={<Inbox className="h-7 w-7" />} title={title} body={body} action={action} />;
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
  return (
    <StateBlock icon={<CloudOff className="h-7 w-7" />} title={title} body={body} action={action} />
  );
}
