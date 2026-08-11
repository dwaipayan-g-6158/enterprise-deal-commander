import { useCallback, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { useTheme } from "next-themes";
import { BellDot, ChevronRight, Download, LogOut, Moon, Settings2, Sun } from "lucide-react";
import { badgeEnabled, badgeSupported, disableBadge, enableBadge } from "@/mobile/lib/app-badge";
import {
  canInstall,
  onInstallAvailabilityChange,
  promptInstall,
} from "@/mobile/lib/install-prompt";
import { SETTINGS_SCREENS } from "@/mobile/nav/routes";
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
/** What the badge row says underneath itself, which is where the refusal lands. */
function badgeSub(on: boolean, denied: boolean): string {
  if (on) return "Shows how many deals are in the red";
  if (denied) return "Blocked — allow notifications for this app in Settings";
  return "Needs notification permission";
}

export function AccountScreen() {
  const { user, role } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const signOut = useSignOut();
  const [signingOut, setSigningOut] = useState(false);

  // useSyncExternalStore, because the store is a module that captured
  // `beforeinstallprompt` before React mounted — see install-prompt.ts. The
  // server snapshot is `false`: there is no install offer during SSR or the
  // first paint, and claiming otherwise would flash a row that then vanishes.
  const installable = useSyncExternalStore(
    onInstallAvailabilityChange,
    canInstall,
    useCallback(() => false, []),
  );

  const isDark = resolvedTheme === "dark";

  const [badgeOn, setBadgeOn] = useState(badgeEnabled);
  const [badgeDenied, setBadgeDenied] = useState(false);

  /**
   * iOS routes the icon badge through notification permission and only ever
   * asks ONCE, so a decline here is permanent until the user goes into
   * Settings. That is why this is a row that says what the permission is for
   * and asks only on tap, rather than a prompt at launch — and why a refusal
   * has to explain the trip to Settings rather than just failing quietly.
   */
  const toggleBadge = async () => {
    if (badgeOn) {
      await disableBadge();
      setBadgeOn(false);
      setBadgeDenied(false);
      return;
    }
    const result = await enableBadge();
    setBadgeOn(result === "enabled");
    setBadgeDenied(result !== "enabled");
  };

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
        {/* Absent entirely where the platform cannot badge an icon, rather than
            present and inert — a control that cannot do anything is worse than
            no control, because tapping it is the only way to find out.

            It moved here from the Commander sheet, which is about the current
            screen's verb rather than about the account. The outcome is reported
            in this row instead of in a toast: <Toaster/> renders outside
            `.m-shell`, so it paints desktop tokens on a phone. */}
        {badgeSupported() ? (
          <ListRow
            media={<BellDot className="h-4 w-4" aria-hidden="true" />}
            title={badgeOn ? "Alert count on app icon" : "Show alert count on app icon"}
            sub={badgeSub(badgeOn, badgeDenied)}
            onPress={() => void toggleBadge()}
          />
        ) : null}
      </section>

      <nav aria-label="Settings" className="mb-4">
        <ul className="m-card overflow-hidden">
          {SETTINGS_SCREENS.map((screen, i) => (
            <li key={screen.id} className={i > 0 ? "border-t border-border" : undefined}>
              <Link
                href={`/settings/${screen.id}`}
                className="m-tap m-press flex items-center gap-3 px-4 py-3.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="m-headline block truncate">{screen.title}</span>
                  <span className="m-caption m-muted block text-pretty">{screen.blurb}</span>
                </span>
                <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Only when the browser has actually offered an install. It is not
          rendered-and-disabled on iOS, where `beforeinstallprompt` does not
          exist and installing is Share → Add to Home Screen — a button that
          cannot do anything is worse than no button, because tapping it is the
          only way to find out. */}
      {installable ? (
        <section className="m-card mb-4 px-4">
          <ListRow
            media={<Download className="h-4 w-4" aria-hidden="true" />}
            title="Install Deal Commander"
            sub="Full screen, and offline reads on the last-synced data"
            onPress={() => void promptInstall()}
          />
        </section>
      ) : null}

      {/* Sign out sits ABOVE the engine-settings note, and the order is the fix
          for a real defect rather than a preference.

          This screen is a little taller than the shell's usable area, so it
          carries ~128px of scroll — not enough for it to read as scrollable, and
          the tab bar and capsule float over its last ~132px. With sign out last,
          it rendered 28px under the tab bar with the capsule over the remaining
          20px: none of it was tappable, a tap at its centre switched tabs, and
          there was no cue that scrolling was required. Measured on the deployed
          app; it is how this account failed to sign out the first time.

          The capsule is now hidden here too (see commander-button.tsx). What
          this ordering adds is the rule behind it: floating chrome may cover
          prose, never the one destructive control on the screen. The note below
          is the right thing to leave in that band — it reads fine after the
          small scroll it invites, and nothing is lost by not tapping it. */}
      <section className="m-card mb-4 px-4">
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

      {/* The five authoring tabs, with the reason stated rather than the rows
          simply missing. A reader who cannot find Thresholds should learn why
          here rather than concluding the app forgot them. */}
      <section className="m-card px-4">
        <ListRow
          media={<Settings2 className="h-4 w-4" aria-hidden="true" />}
          title="Engine settings"
          body="Thresholds, score weights, custom patterns, smart alerts and webhooks are authoring surfaces — every control on them is a write this app does not do. They stay on desktop."
        />
      </section>
    </MScreen>
  );
}
