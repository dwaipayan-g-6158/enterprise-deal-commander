import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { useGetMe } from "@workspace/api-client-react";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Deals from "@/pages/deals";
import DealCockpit from "@/pages/deal-cockpit";
import Portfolio from "@/pages/portfolio";
import Autopsy from "@/pages/autopsy";
import Settings from "@/pages/settings";
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
  const { data: user, isLoading, isError } = useGetMe();

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      setLocation("/login");
    }
  }, [isLoading, isError, user, setLocation]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background">Loading...</div>;

  if (isError || !user) {
    return null;
  }

  return (
    <Layout>
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
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
