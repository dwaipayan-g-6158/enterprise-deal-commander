import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { OfflineBanner } from "@/components/offline-banner";
import { OfflineSaveNotice } from "@/components/offline-save-notice";
import { ThemeProvider } from "@/components/theme-provider";
import { CommandPalette } from "@/components/command-palette";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const [, setLocation] = useLocation();
  // /auth/me is deliberately never cached (auth must hit the network), so when
  // offline the session check can't succeed. Disable it while offline — that
  // avoids a request storm AND lets us keep showing the app shell + cached
  // reads instead of bouncing to /login. When connectivity returns the query
  // re-enables, re-validates, and redirects if the session is actually gone.
  // (Logout purges the read cache, so a logged-out user still sees nothing.)
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const { data: user, isLoading, isError } = useGetMe({
    query: { enabled: !offline, queryKey: getGetMeQueryKey() },
  });

  useEffect(() => {
    if (!offline && !isLoading && (isError || !user)) {
      setLocation("/login");
    }
  }, [offline, isLoading, isError, user, setLocation]);

  if (!offline) {
    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background">Warming up…</div>;
    if (isError || !user) return null;
  }

  return (
    <Layout>
      <CommandPalette />
      <Component {...rest} />
    </Layout>
  );
}

function Router() {
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
      <Route path="/m"><Redirect to="/" /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
          <PwaUpdatePrompt />
          <OfflineBanner />
          <OfflineSaveNotice />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
