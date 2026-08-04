import type { ComponentType } from "react";
import { Switch, Route, Redirect } from "wouter";
import { RoleProvider } from "@/lib/auth/role-context";
import { useAuthGuard } from "@/lib/auth/use-auth-guard";
import { MobileShell } from "@/mobile/shell/mobile-shell";
import { MobileShellSkeleton } from "@/mobile/shell/mobile-shell-skeleton";
import { DesktopOnlyScreen } from "@/mobile/screens/desktop-only-screen";
import { DealsScreen } from "@/mobile/screens/deals-screen";
import { DealDetailScreen } from "@/mobile/screens/deal-detail-screen";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Share from "@/pages/share";

/**
 * Session guard for the mobile shell. Same semantics as the desktop guard —
 * one shared useAuthGuard(), different loading chrome.
 *
 * RoleProvider is mounted even though the mobile surface renders no write
 * controls: it also drives the offline last-known-role mirror that
 * role-context.tsx maintains, and keeps useSession() available to anything
 * that wants to deep-link a user back to the full desktop cockpit.
 *
 * CommandPaletteProvider is deliberately absent — the Commander sheet owns its
 * own open state, so phones never mount cmdk's dialog.
 */
function MobileProtectedRoute({
  component: Component,
  params,
}: {
  component: ComponentType<any>;
  params?: Record<string, string>;
}) {
  const { user, offline, pending } = useAuthGuard();

  if (!offline && pending) return <MobileShellSkeleton />;

  return (
    <RoleProvider user={user}>
      <MobileShell>
        <Component {...(params ?? {})} />
      </MobileShell>
    </RoleProvider>
  );
}

/** Placeholder until each screen lands. */
function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-24 text-center">
      <p className="m-h3">{name}</p>
      <p className="m-body m-muted">Mobile screen coming up next.</p>
    </div>
  );
}

/**
 * The mobile experience. Lazy-loaded by ShellGate (App.tsx) so desktop never
 * downloads it. Route paths match the desktop shell exactly, so a deep link
 * shared between a phone and a laptop opens the right experience on each
 * without any redirect.
 */
export default function MobileApp() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/share/:token" component={Share} />

      <Route path="/">
        <MobileProtectedRoute component={() => <Placeholder name="Command Center" />} />
      </Route>
      <Route path="/deals">
        <MobileProtectedRoute component={DealsScreen} />
      </Route>
      <Route path="/deals/:id">
        {(params) => (
          // Keyed so switching deals remounts the screen: section open/closed
          // state belongs to the deal you opened it on, not the next one.
          <MobileProtectedRoute
            key={params.id}
            component={DealDetailScreen}
            params={{ id: params.id }}
          />
        )}
      </Route>
      <Route path="/analytics">
        <MobileProtectedRoute component={() => <Placeholder name="Analytics" />} />
      </Route>
      <Route path="/memory">
        <MobileProtectedRoute component={() => <Placeholder name="Memory" />} />
      </Route>
      <Route path="/memory/:id">
        {(params) => (
          <MobileProtectedRoute
            component={() => <Placeholder name={`Memory ${params.id}`} />}
          />
        )}
      </Route>

      {/* Desktop-only surfaces still resolve rather than 404, so a link shared
          from a laptop doesn't dead-end on a phone. */}
      <Route path="/portfolio">
        <MobileProtectedRoute
          component={() => (
            <DesktopOnlyScreen
              name="Portfolio"
              reason="Portfolio risk reads as a heatmap across account managers, technical leads and products — a grid that needs width to compare."
            />
          )}
        />
      </Route>
      <Route path="/autopsy">
        <MobileProtectedRoute
          component={() => (
            <DesktopOnlyScreen
              name="Autopsy"
              reason="Loss analysis puts archetypes, competitors and product gaps side by side, which takes more columns than a phone has."
            />
          )}
        />
      </Route>
      <Route path="/settings">
        <MobileProtectedRoute
          component={() => (
            <DesktopOnlyScreen
              name="Settings"
              reason="Settings is where the engine gets configured, and this app is read-only."
            />
          )}
        />
      </Route>

      <Route path="/m"><Redirect to="/" /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}
