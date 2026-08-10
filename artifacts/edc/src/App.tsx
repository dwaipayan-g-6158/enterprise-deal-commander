import { lazy, Suspense } from "react";
import { Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AmbientBackground } from "@/components/ambient-background";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { OfflineBanner } from "@/components/offline-banner";
import { OfflineSaveNotice } from "@/components/offline-save-notice";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { FocusModeProvider } from "@/lib/presence/focus-mode-context";
import { AppShellSkeleton } from "@/components/app-shell-skeleton";
import { MobileShellSkeleton } from "@/mobile/shell/m-shell-skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";

// Each shell is a separate chunk: a phone never downloads the desktop cockpit,
// roster and settings code, and a laptop never downloads the mobile shell.
const DesktopApp = lazy(() => import("@/desktop/desktop-app"));
const MobileApp = lazy(() => import("@/mobile/mobile-app"));

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

/**
 * Picks the shell by viewport. 767px is the exact complement of the 768px
 * breakpoint the rest of the app uses (layout.tsx's sidebar/hamburger switch,
 * the md: variants in AppShellSkeleton), so there is one source of truth for
 * "this is a phone."
 *
 * useMediaQuery — not useIsMobile — because it seeds its state from
 * window.matchMedia inside the useState initializer and so is correct on the
 * very first render. useIsMobile returns false on render #1, which here would
 * mean every phone briefly mounted (and downloaded) the desktop shell.
 *
 * Both shells serve the same URLs, so a deep link shared between a phone and
 * a laptop opens the right experience on each with no redirect and one
 * manifest start_url.
 */
function ShellGate() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  return (
    <Suspense fallback={isMobile ? <MobileShellSkeleton /> : <AppShellSkeleton />}>
      {isMobile ? <MobileApp /> : <DesktopApp />}
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider>
      <FocusModeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ShellGate />
            </WouterRouter>
            <Toaster />
            <ThemeColorSync />
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
