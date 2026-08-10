import { Link } from "wouter";
import { useSession } from "@/lib/auth/role-context";
import { cn } from "@/lib/utils";

/** Initials from a display name, falling back to the email's local part. */
export function initialsFor(displayName?: string, email?: string): string {
  const source = (displayName ?? "").trim() || (email ?? "").split("@")[0].replace(/[._-]+/g, " ");
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * The account entry point, in the nav bar's trailing slot on the four tab roots.
 *
 * This is where Settings and Users live now. They are not tabs: a tab is a place
 * you go repeatedly, and nobody visits settings repeatedly. Putting account
 * behind an avatar is also where iOS puts it, so the gesture is already learned.
 *
 * Moving it here has a second effect worth stating — it lets the Commander
 * capsule stop being a junk drawer. With place on the tab bar and account on the
 * avatar, the capsule is left with exactly one job: the current screen's verb.
 */
export function MAvatar({ className }: { className?: string }) {
  const { user } = useSession();

  return (
    <Link
      href="/account"
      aria-label="Account and settings"
      className={cn(
        "m-press m-tap flex items-center justify-center",
        // The tap target is 48px via .m-tap; the visible disc is 32, which is
        // the iOS proportion. Growing the disc to fill the target would make it
        // the loudest thing in the bar.
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="m-micro flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
      >
        {initialsFor(user?.displayName, user?.email)}
      </span>
    </Link>
  );
}
