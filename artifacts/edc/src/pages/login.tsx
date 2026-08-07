import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { EdcLogoMark } from "@/components/edc-logo-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { renderSignInForm } from "@/lib/auth/catalyst-client";
import { attachCatalystIframeAutosize } from "@/lib/auth/catalyst-iframe-autosize";
import { themeCatalystIframe } from "@/lib/auth/catalyst-iframe-theme";

const LOGIN_SLOT_ID = "catalyst-login-container";
// Reserves space for Catalyst's typical email-step form so the card doesn't
// visibly jump from a short box to the real content on first paint.
const IFRAME_MIN_HEIGHT = 340;
// How often to check whether the embedded sign-in completed. There is no
// server callback route for Catalyst embedded auth — this app treats
// GET /auth/me as the sole source of truth, same as everywhere else
// (use-auth-guard.ts), so it's polled here too rather than relying on the
// Web SDK's own client-side session helpers.
const AUTH_POLL_MS = 3000;

/**
 * Sign-in — the first screen anyone sees, on a phone as much as a laptop.
 *
 * Post-Catalyst-migration: this used to be a hand-rolled email/password form
 * posting to /auth/login. Catalyst's embedded Web SDK now renders its own
 * sign-in iframe into the slot below (mounted shortly after first paint —
 * the small delay matches the sibling Customer-Insight-Engine project's
 * reference implementation, giving the slot time to exist in the DOM); a
 * poll against /auth/me detects a completed sign-in and does a FULL page
 * navigation (not client-side routing) to "/", so every auth-dependent hook
 * re-runs its check fresh on the new page load.
 *
 * The iframe IS auto-resized (catalyst-iframe-autosize.ts) — the SDK hands
 * back a fixed ~150px frame that clips Zoho's form behind an internal
 * scrollbar — and restyled to EDC's tokens (catalyst-iframe-theme.ts), since
 * Zoho otherwise paints a white panel with its own blue buttons and Roboto
 * type inside this dark card. Both hang off the same `load` hook so they also
 * cover the "Forgot Password?" navigation. Only the sibling project's
 * error-copy rewriting is still not ported (the SDK overwrites the placeholder
 * it would target).
 *
 * Because every input on this page comes from that iframe, a failure to load
 * it leaves nothing to type into — so this component tracks the render
 * explicitly (skeleton → ready | error + retry) rather than firing it and
 * forgetting. Off the deployed AppSail domain the failure is guaranteed, not
 * hypothetical: the SDK's `/__catalyst/sdk/init.js` is served by the Catalyst
 * gateway and 404s anywhere else, localhost included.
 */
export default function Login() {
  const slotRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // Bumping this re-runs the mount effect below, which is the whole retry
  // mechanism — loadCatalystSDK() drops its cached promise on failure, so a
  // second call genuinely re-requests the scripts.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      renderSignInForm(LOGIN_SLOT_ID).then(
        () => {
          if (!cancelled) setStatus("ready");
        },
        (err: unknown) => {
          if (cancelled) return;
          // Previously this whole call was fire-and-forget (`void`), so every
          // failure mode — a blocked CDN, an unreachable gateway, an
          // uninitialized SDK — produced an identical, permanently blank card
          // with the reason visible only as an unhandled rejection in the
          // console. Surface it instead.
          console.error("Catalyst sign-in form failed to render", err);
          setStatus("error");
        },
      );
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [attempt]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    // The theme reads its tokens from `slot`, not :root — custom properties
    // inherit, so the slot resolves `.dark`, `.m-shell` and `data-time-band`
    // together and a phone gets the mobile palette instead of the desktop one.
    return attachCatalystIframeAutosize(slot, {
      onDocument: (doc) => {
        const verdict = themeCatalystIframe(slot, doc);
        slot.dataset.edcIframeTheme = verdict.ok ? "applied" : "partial";
        if (!verdict.ok) {
          // A Zoho selector rename is otherwise silent — the form still works,
          // it just looks foreign again. Leave a greppable trace.
          slot.dataset.edcIframeThemeMissed = verdict.missed.join(",");
          console.warn("Catalyst sign-in theme partially applied", verdict.missed);
        }
      },
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/v1/auth/me`, { credentials: "include" });
        if (!cancelled && res.ok) {
          window.clearInterval(interval);
          window.location.assign(`${window.location.origin}/`);
        }
      } catch {
        // Ignore — try again on the next tick.
      }
    }, AUTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[20%] left-1/2 h-[55%] w-[60%] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]" />
        <div className="absolute -right-[10%] top-[55%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* The lockup. Uppercase here is a logotype, not a UI label. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <EdcLogoMark size={72} animated={false} />
          <h2 className="mt-4 text-base font-bold uppercase leading-snug tracking-[0.15em] text-foreground sm:text-lg sm:tracking-[0.18em]">
            Enterprise Deal Commander
          </h2>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Commander Console
          </p>
        </div>

        <div className="w-full overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-2xl backdrop-blur-xl">
          <div className="p-6">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace to continue.</p>
          </div>

          <div className="border-t border-border/60" />

          <div className="p-6">
            {status === "error" ? (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Can't load the sign-in form</AlertTitle>
                  <AlertDescription>
                    Sign-in is handled by Zoho Catalyst, and its form couldn't be reached. Check
                    your connection and try again — if it keeps failing, the identity service may
                    be temporarily unavailable.
                  </AlertDescription>
                </Alert>
                <Button variant="outline" className="w-full" onClick={retry}>
                  Try again
                </Button>
              </div>
            ) : null}

            {/* The slot stays mounted in every state: the Catalyst SDK looks it
                up by id, and it must already exist in the DOM when signIn()
                runs. Only its reserved height collapses on failure, so the
                error card above isn't trailed by 340px of dead space — which
                is all this card used to show. */}
            <div className="relative">
              {status === "loading" ? (
                <>
                  <span role="status" className="sr-only">
                    Loading sign-in form…
                  </span>
                  <div className="absolute inset-x-0 top-0 space-y-3" aria-hidden="true">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="mt-2 h-10 w-full" />
                  </div>
                </>
              ) : null}
              <div
                ref={slotRef}
                id={LOGIN_SLOT_ID}
                className="relative w-full [&_iframe]:!w-full [&_iframe]:!border-0 [&_iframe]:!bg-transparent"
                style={{ minHeight: status === "error" ? 0 : IFRAME_MIN_HEIGHT }}
              />
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Access is invite-only. Contact an admin if you need an account. Sessions are audited.
        </p>
      </div>
    </div>
  );
}
