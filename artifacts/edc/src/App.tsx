import { lazy, Suspense } from "react";
import { Router as WouterRouter, useLocation } from "wouter";
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
import { AppReveal } from "@/components/app-reveal";
import { isOutsideShell, isSignInRoute, SIGN_IN_CANVAS } from "@/lib/shell-routes";
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
  const [location] = useLocation();

  /**
   * No shell chrome in front of a route that renders no shell.
   *
   * Both skeletons are previews of the signed-in app — the desktop one draws a
   * 256px sidebar with seven nav rows, an avatar and two buttons; the mobile one a
   * nav bar and the four-item tab bar. In front of the sign-in page that is not a
   * loading state, it is a false claim: measured on the deployed build, a refresh
   * of `/login` showed the full desktop shell from 61ms to 342ms and only then the
   * sign-in card. Reported as "it gives the impression that I am already logged
   * in", and it is the same on a phone.
   *
   * What replaces it is a bare canvas, not a lighter placeholder: the page brings
   * its own entrance and its card already has a skeleton inside it for the Catalyst
   * frame, so there is nothing for a placeholder to hand off from.
   *
   * Sign-in gets that canvas in ITS OWN colour, and the reason is the one thing
   * index.html's pre-paint stamp cannot cover. The stamp forces dark on this route
   * so the first painted frame matches the page — but next-themes restores the
   * stored preference the moment React mounts, and this Suspense gap is entirely
   * after that. Measured: a light-mode reader saw dark for a few frames, then
   * rgb(243,244,247) for the ~370ms the lazy shell chunk took, then the near-black
   * page. Painting the gap ourselves is what makes those three one colour. `/share`
   * is deliberately excluded — it is public but fully themed, so it must keep the
   * reader's own background.
   *
   * `lib/shell-routes.ts` owns the routes and the colour; AppReveal reads the same
   * list to know what not to mask.
   */
  const shellIsComing = !isOutsideShell(location);
  const fallback = shellIsComing ? (
    isMobile ? <MobileShellSkeleton /> : <AppShellSkeleton />
  ) : isSignInRoute(location) ? (
    // Decorative: MobileShellSkeleton and AppShellSkeleton own the only load
    // announcements in the boot stack, and the sign-in page announces its own form.
    <div aria-hidden="true" className="fixed inset-0" style={{ background: SIGN_IN_CANVAS }} />
  ) : null;

  return <Suspense fallback={fallback}>{isMobile ? <MobileApp /> : <DesktopApp />}</Suspense>;
}

function App() {
  return (
    <ThemeProvider>
      <FocusModeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ShellGate />
              {/* Inside the Router, not beside it: AppReveal reads the current
                  path to stay off the sign-in, share and Catalyst-bounce routes,
                  and useLocation outside a Router has no base applied. Inside
                  QueryClientProvider too, because its readiness signal is
                  useIsFetching. One instance covers both shells — ShellGate picks
                  a shell below this point, so neither has to know it exists. */}
              <AppReveal />
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
