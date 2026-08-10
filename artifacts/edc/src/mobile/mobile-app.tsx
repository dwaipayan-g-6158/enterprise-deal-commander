import type { ReactNode } from "react";
import { Switch, Route, Redirect, Router } from "wouter";
import { RoleProvider } from "@/lib/auth/role-context";
import { aroundNav } from "@/mobile/lib/nav-transition";
import { installBackGesture } from "@/mobile/lib/back-gesture";
import { useAuthGuard } from "@/lib/auth/use-auth-guard";
import { CatalystAuthBounce } from "@/lib/auth/catalyst-auth-bounce";
import { MShell } from "@/mobile/shell/m-shell";
import { MobileShellSkeleton } from "@/mobile/shell/m-shell-skeleton";
import { BootSplash } from "@/mobile/shell/boot-splash";
import { DesktopOnlyScreen } from "@/mobile/screens/desktop-only-screen";
import { AccountScreen } from "@/mobile/screens/account/account-screen";
import { CommandScreen } from "@/mobile/screens/command/command-screen";
import { DealsScreen } from "@/mobile/screens/deals/deals-screen";
import { DealBriefScreen } from "@/mobile/screens/deal/deal-brief-screen";
import { DealPanelScreen } from "@/mobile/screens/deal/panel-screen";
import { AnalyticsScreen } from "@/mobile/screens/analytics-screen";
import { MemoryScreen } from "@/mobile/screens/memory-screen";
import { MemoryDetailScreen } from "@/mobile/screens/memory-detail-screen";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Share from "@/pages/share";
// The mobile chunk's stylesheets, imported at its entry rather than inside
// MShell: BootSplash below borrows .m-shell's tokens and renders before any
// shell has mounted.
import "@/mobile/styles/tokens.css";
import "@/mobile/styles/material.css";
import "@/mobile/styles/type.css";
import "@/mobile/styles/motion.css";

/**
 * Registered at MODULE SCOPE, deliberately, and this is load-bearing.
 *
 * The interception is a capture-phase `popstate` listener, and for listeners on
 * the event's own target the DOM spec invokes them in REGISTRATION ORDER — the
 * capture flag does not promote one ahead of a listener registered earlier. So
 * being first is what matters, and module evaluation happens before any React
 * render, which puts us ahead of wouter's own subscription.
 *
 * Moving this into an effect would silently stop back gestures animating while
 * leaving everything else working. See back-gesture.ts.
 */
installBackGesture();

/**
 * Session guard for the mobile shell. Same semantics as the desktop guard — one
 * shared useAuthGuard(), different loading chrome.
 *
 * RoleProvider is mounted even though most of the mobile surface is read-only:
 * it drives the offline last-known-role mirror, and useSession() feeds the
 * avatar and the role chip.
 *
 * CommandPaletteProvider is deliberately absent — the Commander sheet owns its
 * own open state, so phones never mount cmdk's dialog.
 */
function MobileGuard({ children }: { children: ReactNode }) {
  const { user, offline, pending } = useAuthGuard();

  if (!offline && pending) return <MobileShellSkeleton />;

  return <RoleProvider user={user}>{children}</RoleProvider>;
}

/**
 * Tokens without chrome, for the screens that render outside the shell —
 * sign-in and the auth bounce. Both are shared components that also serve
 * desktop, so they can't take `.m-shell` themselves; wrapping the route gives
 * them the mobile palette and radius scale on a phone and leaves the desktop
 * tree alone. Same mechanism MSheet uses for vaul’s portalled drawer.
 *
 * No layout classes: the shell's own frame is `h-[100dvh] overflow-hidden`, and
 * these pages manage their own height.
 */
function MobileTokens({ children }: { children: ReactNode }) {
  return <div className="m-shell">{children}</div>;
}

/**
 * The mobile experience. Lazy-loaded by ShellGate (App.tsx) so desktop never
 * downloads it. Route paths match the desktop shell, so a deep link shared
 * between a phone and a laptop opens the right experience on each.
 *
 * ## Two Switches, on purpose
 *
 * The outer one separates the routes that render OUTSIDE the shell — sign-in,
 * the public share card, Catalyst's auth bounce — from everything that renders
 * inside it. The inner one selects the screen.
 *
 * That split is what lets `MShell` mount exactly once. It used to sit inside
 * each `<Route>`, so React unmounted and remounted the entire shell on every
 * navigation, which made scroll restoration, the large-title collapse and
 * stable view-transition chrome all impossible. See MShell's own note.
 */
export default function MobileApp() {
  return (
    // A nested Router purely to install aroundNav, which wraps every
    // programmatic navigation below it in a view transition. It declares no base
    // of its own, so it inherits App.tsx's, and the desktop shell — outside this
    // subtree — is untouched.
    <Router aroundNav={aroundNav}>
      {/* Outside both Switches so it survives the auth guard's loading chrome
          and the first navigation. Renders nothing in a browser tab, after its
          one play, or under reduced motion. */}
      <BootSplash />

      <Switch>
        <Route path="/login">
          <MobileTokens>
            <Login />
          </MobileTokens>
        </Route>
        <Route path="/share/:token" component={Share} />
        <Route path="/__catalyst/*" component={CatalystAuthBounce} />
        <Route path="/accounts/*" component={CatalystAuthBounce} />
        {/* transition={false}: <Redirect> navigates from a layout effect, where
            aroundNav's flushSync is not safe to call. */}
        <Route path="/m">
          <Redirect to="/" transition={false} />
        </Route>

        <Route>
          <MobileGuard>
            <MShell>
              {/* This list, and its ORDER, are asserted against nav/routes.ts
                  by routes.test.ts — which reads this file. The table is where
                  the literal-before-param rule and the tab ownership live; this
                  is where the screens are attached. Neither can drift. */}
              <Switch>
                <Route path="/" component={CommandScreen} />
                <Route path="/deals" component={DealsScreen} />
                <Route path="/deals/:id">
                  {(params) => (
                    // Keyed so switching deals remounts the screen rather than
                    // reusing one deal's local state for the next.
                    <DealBriefScreen key={params.id} id={params.id} />
                  )}
                </Route>
                {/* One route for all sixteen panels; the segment is resolved
                    against nav/routes.ts. Keyed on both parts, so moving between
                    two panels of the same deal — or the same panel of two deals
                    — starts the new screen clean rather than showing the
                    previous one's sheet state. */}
                <Route path="/deals/:id/:panel">
                  {(params) => (
                    <DealPanelScreen
                      key={`${params.id}:${params.panel}`}
                      id={params.id}
                      panelId={params.panel}
                    />
                  )}
                </Route>

                <Route path="/analytics" component={AnalyticsScreen} />

                {/* Desktop-only surfaces still resolve rather than 404, so a
                    link shared from a laptop doesn't dead-end on a phone. These
                    shrink as the Intelligence tab absorbs Portfolio and Autopsy
                    in a later slice. */}
                <Route path="/portfolio">
                  <DesktopOnlyScreen
                    name="Portfolio"
                    reason="Portfolio risk reads as a heatmap across account managers, technical leads and products — a grid that needs width to compare."
                  />
                </Route>
                <Route path="/autopsy">
                  <DesktopOnlyScreen
                    name="Autopsy"
                    reason="Loss analysis puts archetypes, competitors and product gaps side by side, which takes more columns than a phone has."
                  />
                </Route>

                <Route path="/memory" component={MemoryScreen} />
                <Route path="/memory/:id">
                  {(params) => <MemoryDetailScreen key={params.id} id={params.id} />}
                </Route>

                <Route path="/account" component={AccountScreen} />
                <Route path="/settings">
                  <DesktopOnlyScreen
                    name="Settings"
                    reason="Settings is where the engine gets configured — thresholds, score weights and alert rules are authoring surfaces."
                  />
                </Route>

                {/* Inside the shell, so a mistyped URL still has a tab bar to
                    leave by rather than stranding the reader. */}
                <Route component={NotFound} />
              </Switch>
            </MShell>
          </MobileGuard>
        </Route>
      </Switch>
    </Router>
  );
}
