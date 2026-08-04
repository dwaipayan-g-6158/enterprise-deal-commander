import type { ComponentType, ReactNode } from "react";
import { Switch, Route, Redirect, Router } from "wouter";
import { RoleProvider } from "@/lib/auth/role-context";
import { aroundNav } from "@/mobile/lib/view-transitions";
import { useAuthGuard } from "@/lib/auth/use-auth-guard";
import { MobileShell } from "@/mobile/shell/mobile-shell";
import { MobileShellSkeleton } from "@/mobile/shell/mobile-shell-skeleton";
import { BootSplash } from "@/mobile/shell/boot-splash";
import { DesktopOnlyScreen } from "@/mobile/screens/desktop-only-screen";
import { HomeScreen } from "@/mobile/screens/home-screen";
import { DealsScreen } from "@/mobile/screens/deals-screen";
import { DealDetailScreen } from "@/mobile/screens/deal-detail-screen";
import { AnalyticsScreen } from "@/mobile/screens/analytics-screen";
import { MemoryScreen } from "@/mobile/screens/memory-screen";
import { MemoryDetailScreen } from "@/mobile/screens/memory-detail-screen";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Share from "@/pages/share";
// The mobile chunk's stylesheets, imported at its entry rather than inside
// MobileShell: BootSplash below borrows .m-shell's tokens and renders before
// any MobileShell has mounted.
import "@/mobile/mobile.css";
import "@/mobile/motion.css";

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

/**
 * Tokens without chrome, for the two screens that render outside `MobileShell`
 * — sign-in and the 404. Both are shared components that also serve desktop,
 * so they can't take `.m-shell` themselves; wrapping the route gives them the
 * mobile palette and radius scale on a phone and leaves the desktop tree
 * alone. Same mechanism `SectionSheet` uses for vaul's portalled drawer.
 *
 * No layout classes: the shell's own frame is `h-[100dvh] overflow-hidden`,
 * and these two pages manage their own height.
 */
function MobileTokens({ children }: { children: ReactNode }) {
  return <div className="m-shell">{children}</div>;
}

/**
 * The mobile experience. Lazy-loaded by ShellGate (App.tsx) so desktop never
 * downloads it. Route paths match the desktop shell exactly, so a deep link
 * shared between a phone and a laptop opens the right experience on each
 * without any redirect.
 */
export default function MobileApp() {
  return (
    // A nested Router purely to install aroundNav, which wraps every
    // navigation below it in a view transition. It declares no base of its
    // own, so it inherits App.tsx's, and the desktop shell — outside this
    // subtree — is untouched.
    <Router aroundNav={aroundNav}>
      {/* Outside the Switch so it survives the auth guard's own loading
          chrome and the first navigation. It renders nothing at all in a
          browser tab, after its one play, or under reduced motion. */}
      <BootSplash />
      <Switch>
        <Route path="/login">
          <MobileTokens>
            <Login />
          </MobileTokens>
        </Route>
        <Route path="/share/:token" component={Share} />

        <Route path="/">
          <MobileProtectedRoute component={HomeScreen} />
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
          <MobileProtectedRoute component={AnalyticsScreen} />
        </Route>
        <Route path="/memory">
          <MobileProtectedRoute component={MemoryScreen} />
        </Route>
        <Route path="/memory/:id">
          {(params) => (
            <MobileProtectedRoute
              key={params.id}
              component={MemoryDetailScreen}
              params={{ id: params.id }}
            />
          )}
        </Route>

        {/* Desktop-only surfaces still resolve rather than 404, so a link
            shared from a laptop doesn't dead-end on a phone. */}
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

        {/* transition={false}: <Redirect> navigates from a layout effect,
            where aroundNav's flushSync is not safe to call. */}
        <Route path="/m"><Redirect to="/" transition={false} /></Route>
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}
