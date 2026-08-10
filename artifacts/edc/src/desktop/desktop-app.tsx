import { Switch, Route, Redirect } from "wouter";
import { RoleProvider } from "@/lib/auth/role-context";
import { useAuthGuard } from "@/lib/auth/use-auth-guard";
import { CatalystAuthBounce } from "@/lib/auth/catalyst-auth-bounce";
import { AppShellSkeleton } from "@/components/app-shell-skeleton";
import { CommandPaletteProvider } from "@/lib/command-palette-context";
import { CommandPalette } from "@/components/command-palette";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Deals from "@/pages/deals";
import DealCockpit from "@/pages/deal-cockpit";
import Portfolio from "@/pages/portfolio";
import Autopsy from "@/pages/autopsy";
import Settings from "@/pages/settings";
import Analytics from "@/pages/analytics";
import Memory from "@/pages/memory";
import MemoryDetail from "@/pages/memory-detail";
import Share from "@/pages/share";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, offline, pending } = useAuthGuard();

  // Skeleton rather than null while unresolved: null renders one blank white
  // commit before the redirect effect fires. The shell exposes no user data.
  if (!offline && pending) return <AppShellSkeleton />;

  return (
    <RoleProvider user={user}>
      <CommandPaletteProvider>
        <Layout>
          <CommandPalette />
          <Component {...rest} />
        </Layout>
      </CommandPaletteProvider>
    </RoleProvider>
  );
}

/**
 * The full desktop experience. Lazy-loaded by ShellGate (App.tsx) so phones
 * never download it.
 */
export default function DesktopApp() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/share/:token" component={Share} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/deals" component={() => <ProtectedRoute component={Deals} />} />
      <Route path="/deals/:id" component={() => <ProtectedRoute component={DealCockpit} />} />
      <Route path="/portfolio" component={() => <ProtectedRoute component={Portfolio} />} />
      <Route path="/autopsy" component={() => <ProtectedRoute component={Autopsy} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/memory" component={() => <ProtectedRoute component={Memory} />} />
      <Route path="/memory/:id" component={() => <ProtectedRoute component={MemoryDetail} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />

      {/* Deep-link parity with the mobile shell.
          Mobile addresses each panel as its own pushed screen — /deals/:id/gates,
          /autopsy/archetypes, /memory/:id/timeline — because a phone navigates by
          pushing, not by switching tabs in place. Desktop has no such URLs: its
          sub-tab is local state. Without these, a link a rep shares from the field
          404s for whoever opens it on a laptop, which is exactly the dead-end the
          shared-URL design exists to prevent.

          Redirect to the parent rather than honouring the panel: desktop's sub-tab
          isn't addressable, so there is nothing to redirect *to*. Landing on the
          right deal at its default tab is the honest outcome. Registered after the
          parent routes purely for readability — wouter matches whole paths, so the
          differing segment counts never collide. */}
      <Route path="/deals/:id/:panel">{(p) => <Redirect to={`/deals/${p.id}`} />}</Route>
      <Route path="/memory/:id/:panel">{(p) => <Redirect to={`/memory/${p.id}`} />}</Route>
      <Route path="/analytics/:panel"><Redirect to="/analytics" /></Route>
      <Route path="/portfolio/:panel"><Redirect to="/portfolio" /></Route>
      <Route path="/autopsy/:panel"><Redirect to="/autopsy" /></Route>

      <Route path="/m"><Redirect to="/" /></Route>
      <Route path="/__catalyst/*" component={CatalystAuthBounce} />
      <Route path="/accounts/*" component={CatalystAuthBounce} />
      <Route component={NotFound} />
    </Switch>
  );
}
