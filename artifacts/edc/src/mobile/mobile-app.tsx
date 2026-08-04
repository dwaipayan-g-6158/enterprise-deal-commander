import { Switch, Route, Redirect } from "wouter";
import { RoleProvider } from "@/lib/auth/role-context";
import { useAuthGuard } from "@/lib/auth/use-auth-guard";
import { MobileShellSkeleton } from "@/mobile/shell/mobile-shell-skeleton";
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
function MobileProtectedRoute({ component: Component, ...rest }: any) {
  const { user, offline, pending } = useAuthGuard();

  if (!offline && pending) return <MobileShellSkeleton />;

  return (
    <RoleProvider user={user}>
      <Component {...rest} />
    </RoleProvider>
  );
}

/** Placeholder until the real screens land. */
function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-lg font-semibold">{name}</p>
      <p className="text-sm text-muted-foreground">Mobile screen coming up next.</p>
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
      <Route path="/" component={() => <MobileProtectedRoute component={() => <Placeholder name="Command Center" />} />} />
      <Route path="/deals" component={() => <MobileProtectedRoute component={() => <Placeholder name="Deals" />} />} />
      <Route path="/deals/:id" component={() => <MobileProtectedRoute component={() => <Placeholder name="Deal" />} />} />
      <Route path="/analytics" component={() => <MobileProtectedRoute component={() => <Placeholder name="Analytics" />} />} />
      <Route path="/memory" component={() => <MobileProtectedRoute component={() => <Placeholder name="Memory" />} />} />
      <Route path="/memory/:id" component={() => <MobileProtectedRoute component={() => <Placeholder name="Memory detail" />} />} />
      {/* Desktop-only surfaces still resolve rather than 404, so a link shared
          from a laptop doesn't dead-end on a phone. */}
      <Route path="/portfolio" component={() => <MobileProtectedRoute component={() => <Placeholder name="Portfolio" />} />} />
      <Route path="/autopsy" component={() => <MobileProtectedRoute component={() => <Placeholder name="Autopsy" />} />} />
      <Route path="/settings" component={() => <MobileProtectedRoute component={() => <Placeholder name="Settings" />} />} />
      <Route path="/m"><Redirect to="/" /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}
