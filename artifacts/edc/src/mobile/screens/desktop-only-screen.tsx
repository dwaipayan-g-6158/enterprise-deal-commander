import { Link } from "wouter";
import { Monitor } from "lucide-react";
import { MNavBar } from "@/mobile/shell/m-nav-bar";

/**
 * Stands in for Portfolio, Autopsy and Settings. Those are wide table and
 * admin surfaces that a phone can't show honestly, but their URLs still have
 * to resolve — a teammate pasting a link from their laptop shouldn't send you
 * to a 404.
 */
export function DesktopOnlyScreen({ name, reason }: { name: string; reason: string }) {
  return (
    <>
      <MNavBar title={name} />
      <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
        <span className="m-card flex h-14 w-14 items-center justify-center rounded-full">
          <Monitor className="h-6 w-6 m-muted" aria-hidden="true" />
        </span>
        <h2 className="m-title">{name} is a desktop view</h2>
        <p className="m-body m-muted max-w-xs">
          {reason} Open Deal Commander on a larger display to work with it.
        </p>
        <Link
          href="/"
          className="m-tap m-press m-headline mt-2 inline-flex items-center rounded-full bg-secondary px-5 text-secondary-foreground"
        >
          Back to Command Center
        </Link>
      </div>
    </>
  );
}
