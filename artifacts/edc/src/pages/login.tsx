import { useEffect, useRef } from "react";
import { EdcLogoMark } from "@/components/edc-logo-mark";
import { renderSignInForm } from "@/lib/auth/catalyst-client";
import { attachCatalystIframeAutosize } from "@/lib/auth/catalyst-iframe-autosize";

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
 * scrollbar. The sibling project's other polish (theme injection, error-copy
 * rewriting) is still deliberately not ported: this project has CSS
 * Customization disabled in the Catalyst console, so there is no stylesheet to
 * inject.
 */
export default function Login() {
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      void renderSignInForm(LOGIN_SLOT_ID);
    }, 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    return attachCatalystIframeAutosize(slot);
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
            <div
              ref={slotRef}
              id={LOGIN_SLOT_ID}
              className="relative w-full [&_iframe]:!w-full [&_iframe]:!border-0 [&_iframe]:!bg-transparent"
              style={{ minHeight: IFRAME_MIN_HEIGHT }}
            />
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Access is invite-only. Contact an admin if you need an account. Sessions are audited.
        </p>
      </div>
    </div>
  );
}
