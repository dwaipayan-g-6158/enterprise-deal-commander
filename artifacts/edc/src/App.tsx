import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { RoleProvider } from "@/lib/auth/role-context";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { AmbientBackground } from "@/components/ambient-background";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { OfflineBanner } from "@/components/offline-banner";
import { OfflineSaveNotice } from "@/components/offline-save-notice";
import { ThemeProvider } from "@/components/theme-provider";
import { FocusModeProvider } from "@/lib/presence/focus-mode-context";
import { CommandPaletteProvider } from "@/lib/command-palette-context";
import { CommandPalette } from "@/components/command-palette";
import { EdcLogoMark } from "@/components/edc-logo-mark";
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
  // Backstop for any write control the RBAC gating sweep missed. Fires for
  // every mutation regardless of the call site's own onError/try-catch, so a
  // reader who finds an ungated button gets a visible explanation instead of
  // a silent no-op.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // ApiError is not re-exported from @workspace/api-client-react's
      // barrel (only the internal ErrorType alias is), so duck-type the
      // status field it always sets (lib/api-client-react/custom-fetch.ts).
      if ((error as { status?: number } | null)?.status !== 403) return;
      if (mutation.meta?.suppressForbiddenToast) return;

      // Deferred one tick: use-toast's TOAST_LIMIT is 1, and React Query
      // runs the mutation-cache-level onError BEFORE the mutateAsync
      // rejection reaches the calling component. Without the defer, a call
      // site's own generic "Save failed" toast would immediately replace
      // this specific one.
      setTimeout(() => {
        toast({
          title: "Read-only access",
          description:
            "Your account can view everything but can't make changes. Ask an admin if you need write access.",
          variant: "destructive",
        });
      }, 0);
    },
  }),
});

// Standalone by necessity: <Layout> calls useCommandPalette() (layout.tsx:194)
// and this renders before <CommandPaletteProvider> mounts, so reusing Layout
// would throw. Mirrors the chrome at layout.tsx:211-256 class-for-class so the
// real sidebar/header take over with no pop. Only the page-title bar is drawn
// in the main area — a strict subset of each page's own skeleton at the same
// coordinates, so the frame-1 -> frame-2 transition is additive, not a swap.
function AppShellSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-background" aria-busy="true">
      <span role="status" className="sr-only">Loading Enterprise Deal Commander…</span>

      {/* md: (>=768px) is the exact complement of useIsMobile()'s <768px
          breakpoint, and unlike that hook (which returns false on its first
          render) a media query is correct on the very first paint. */}
      <aside className="hidden w-64 border-r border-border bg-card flex-col md:flex">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <EdcLogoMark size={52} animated className="shrink-0" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-border space-y-2">
          <Skeleton className="h-[58px] w-full" />
          <Skeleton className="h-[38px] w-full rounded-md" />
          <div className="mb-2 flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 h-14 md:hidden">
          <Skeleton className="h-9 w-9 rounded-md" />
          <EdcLogoMark size={24} animated={false} />
          <Skeleton className="h-4 w-44" />
        </header>
        <main className="flex-1 overflow-auto bg-background [scrollbar-gutter:stable]">
          <div className="h-full @container">
            <div className="p-8 max-w-[1600px] mx-auto space-y-8">
              <div>
                <Skeleton className="h-9 w-72" />
                <div className="mt-2 h-6" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

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
    if (isLoading) return <AppShellSkeleton />;
    // Same skeleton rather than null: null renders one blank white commit
    // before the redirect effect fires. The shell exposes no user data.
    if (isError || !user) return <AppShellSkeleton />;
  }

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
      <FocusModeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
            <AmbientBackground />
            <PwaUpdatePrompt />
            <OfflineBanner />
            <OfflineSaveNotice />
          </TooltipProvider>
        </QueryClientProvider>
      </FocusModeProvider>
    </ThemeProvider>
  );
}

export default App;
