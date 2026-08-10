import { useState } from "react";
import { useTheme } from "next-themes";
import { LogOut, Moon, Settings2, Sun } from "lucide-react";
import { useSession } from "@/lib/auth/role-context";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { MScreen } from "@/mobile/shell/m-screen";
import { MetaChip } from "@/mobile/components/badges";
import { ListRow } from "@/mobile/components/list-row";
import { initialsFor } from "@/mobile/shell/m-avatar";

/**
 * The account surface, reached from the nav bar's avatar.
 *
 * Everything here previously lived inside the Commander sheet, mixed in with
 * search and jump targets. Separating them is what lets each one have a subject:
 * the tab bar is place, the avatar is account, the Commander is the current
 * screen's verb.
 *
 * The read-only settings screens (users, change log, team, targets,
 * achievements) attach to this screen in a later slice; this is the identity,
 * appearance and session part.
 */
export function AccountScreen() {
  const { user, role } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const signOut = useSignOut();
  const [signingOut, setSigningOut] = useState(false);

  const isDark = resolvedTheme === "dark";

  return (
    <MScreen title="Account" backHref="/" backLabel="Back">
      <section className="m-card mb-4 flex items-center gap-3 p-4">
        <span
          aria-hidden="true"
          className="m-headline flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
        >
          {initialsFor(user?.displayName, user?.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-headline truncate">{user?.displayName ?? "Signed in"}</p>
          <p className="m-caption m-muted truncate">{user?.email ?? "Offline"}</p>
        </div>
        {/* The role is stated plainly rather than implied by which controls are
            missing. A reader who cannot find an action should be able to see
            why without guessing. */}
        <MetaChip className="rounded-full px-3 py-1">{role === "admin" ? "Admin" : "Read-only"}</MetaChip>
      </section>

      <section className="m-card mb-4 px-4">
        <ListRow
          media={
            isDark ? (
              <Moon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sun className="h-4 w-4" aria-hidden="true" />
            )
          }
          title={isDark ? "Dark appearance" : "Light appearance"}
          sub="Tap to switch"
          onPress={() => setTheme(isDark ? "light" : "dark")}
        />
      </section>

      <section className="m-card mb-4 px-4">
        <ListRow
          media={<Settings2 className="h-4 w-4" aria-hidden="true" />}
          title="Engine settings"
          body="Thresholds, score weights and alert rules are authoring surfaces, and they stay on desktop."
        />
      </section>

      <section className="m-card px-4">
        <ListRow
          className="text-destructive"
          media={<LogOut className="h-4 w-4" aria-hidden="true" />}
          title={signingOut ? "Signing out…" : "Sign out"}
          onPress={() => {
            if (signingOut) return;
            setSigningOut(true);
            signOut();
          }}
        />
      </section>
    </MScreen>
  );
}
