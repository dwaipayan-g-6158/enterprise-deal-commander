import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, Gauge, Layers, Presentation } from "lucide-react";
import { EdcLogoMark } from "@/components/edc-logo-mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { renderSignInForm } from "@/lib/auth/catalyst-client";
import { attachCatalystIframeAutosize } from "@/lib/auth/catalyst-iframe-autosize";
import { injectCatalystIframeTheme } from "@/lib/auth/catalyst-iframe-link";

const LOGIN_SLOT_ID = "catalyst-login-container";
// Reserves space for Catalyst's typical email-step form so the card doesn't
// visibly jump from a short box to the real content on first paint. Released
// the moment the form is ready: the real email-step frame is ~164px, so holding
// 340px afterwards stranded a fixed band of dead space under the button that
// read as the card being mis-sized. Only the pre-paint reservation is wanted.
const IFRAME_MIN_HEIGHT = 340;
// How often to check whether the embedded sign-in completed. There is no
// server callback route for Catalyst embedded auth — this app treats
// GET /auth/me as the sole source of truth, same as everywhere else
// (use-auth-guard.ts), so it's polled here too rather than relying on the
// Web SDK's own client-side session helpers.
const AUTH_POLL_MS = 3000;

// EDC's .dark palette, inlined. This page deliberately opts OUT of the theme
// system (see the docstring below), so it cannot use the `bg-card`/`text-
// foreground` utilities — those would follow a light-mode preference and leave
// a dark Zoho form on a white card. Keep in sync with index.css's .dark block.
const SHELL_BG = "hsl(220 10% 8%)";
const RAIL_BORDER = "hsl(220 10% 20%)"; // --border
const CARD_BG = "hsl(220 10% 12%)"; // --card
const CARD_BORDER = "hsl(220 10% 20%)";
// Bare HSL triple, not an hsl() string: <EdcLogoMark /> paints itself from
// `hsl(var(--primary))` rather than a prop, so the only way to hand it this
// page's accent is to redeclare the token on an ancestor. Without that it
// resolves --primary from the cascade — 222 90% 55% under :root — and a
// light-mode visitor gets a noticeably darker mark sitting next to bullets and
// a glow that are hardcoded to the .dark value. Invisible while the mark was
// static; not invisible now that it draws itself in as the page's focal point.
const ACCENT_HSL = "222 90% 67%"; // --primary, .dark
const ACCENT = `hsl(${ACCENT_HSL})`;

// Both lockups scope the accent token for the mark. Typed loosely because
// React's CSSProperties has no index signature for custom properties.
const ACCENT_SCOPE = { "--primary": ACCENT_HSL } as CSSProperties;

// The mark's own draw-on sequence (edc-logo-mark.tsx) runs 3.22s at 1x, which
// is splash-screen pacing. Halving it lands the settle at ~1.61s, just after
// the rail cascade's last item, so the whole page arrives as one gesture
// instead of the lockup still animating under a form you can already type in.
const LOGO_TIME_SCALE = 2;

// Each names something the product actually does, in the vocabulary
// docs/glossary.md insists on (technical gate, pattern alert, Executive
// Briefing). No pattern count: the docs state 12, 15 and 16 in different
// places. No "AI"/"predictive": Phase 1 is deterministic by charter, and
// "deterministic" is the documented differentiator.
const HIGHLIGHTS = [
  { icon: Layers, text: "Nine technical gates, reconciled against every commercial stage." },
  { icon: Gauge, text: "A deterministic risk engine — each alert shows the thresholds it fired on." },
  { icon: Presentation, text: "Any deal review projected boardroom-ready, without reformatting." },
];

/**
 * Sign-in — the first screen anyone sees, on a phone as much as a laptop.
 *
 * Post-Catalyst-migration this is not our form: Catalyst's embedded Web SDK
 * renders its own sign-in iframe into the slot below (mounted shortly after
 * first paint — the small delay matches the sibling Customer-Insight-Engine
 * "Periscope" project's reference implementation, giving the slot time to exist
 * in the DOM). A poll against /auth/me detects a completed sign-in and does a
 * FULL page navigation (not client-side routing) to "/", so every auth-dependent
 * hook re-runs its check fresh on the new page load.
 *
 * Layout and iframe theming both follow Periscope, which has run this pattern in
 * production for months: a two-column split with a branding rail, and the Zoho
 * widget flattened into our card by public/login-iframe.css.
 *
 * **This page is always dark and does not participate in the theme system.**
 * The palette above is inlined for that reason. It is what lets the iframe be
 * themed by a single STATIC stylesheet — Zoho fetches that sheet itself via the
 * SDK's `css_url`, before the frame's first paint, and a static file cannot
 * know which of EDC's light/dark × time-band × mobile palettes is active. A
 * previous attempt resolved tokens at runtime and injected a <style> after
 * load; it flashed an unstyled white panel and had to fight Zoho's own sheets
 * with !important on every declaration.
 *
 * The iframe is also auto-resized (catalyst-iframe-autosize.ts) — the SDK hands
 * back a fixed ~150px frame that clips Zoho's form behind an internal
 * scrollbar. Theming re-applies through that module's `onDocument` hook, which
 * fires on both `load` and a `src` mutation: "Forgot Password?" navigates the
 * same iframe to a page that ignores `css_url` and ships its own light reset.
 *
 * Because every input here comes from that iframe, a failure to load it leaves
 * nothing to type into — so this component tracks the render explicitly
 * (skeleton → ready | error + retry) rather than firing it and forgetting. Off
 * the deployed AppSail domain that failure is guaranteed, not hypothetical: the
 * SDK's `/__catalyst/sdk/init.js` is served by the Catalyst gateway and 404s
 * anywhere else, localhost included.
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
          // Fire-and-forget here would turn every failure mode — a blocked CDN,
          // an unreachable gateway, an uninitialized SDK — into an identical,
          // permanently blank card, with the reason visible only as an unhandled
          // rejection in the console. Surface it instead.
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
    return attachCatalystIframeAutosize(slot, {
      // `css_url` already themed the sign-in document before it painted; this
      // covers the documents it doesn't reach, notably the recovery page.
      onDocument: (doc) => {
        slot.dataset.edcIframeTheme = injectCatalystIframeTheme(doc) ? "applied" : "failed";
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
    <div className="flex min-h-[100dvh]" style={{ background: SHELL_BG }}>
      {/* Branding rail. Hidden below lg, where the viewport belongs to the form. */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden border-r px-12 py-12 lg:flex lg:w-[44%]"
        style={{ borderColor: RAIL_BORDER }}
      >
        {/* Accent bleed, off the top-left corner. The only perpetual motion on
            the page — an 18s drift, killed outright (not clamped) under
            prefers-reduced-motion; see index.css's login-glow rules. */}
        <div
          aria-hidden="true"
          className="login-glow pointer-events-none absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, ${ACCENT} 0%, transparent 70%)` }}
        />
        {/* Dot grid — the only texture on the page; keeps the rail from reading
            as an empty panel without competing with the type. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative flex items-center gap-3 text-white" style={ACCENT_SCOPE}>
          <EdcLogoMark size={40} timeScale={LOGO_TIME_SCALE} />
          {/* Uppercase here is the logotype, not a UI label. */}
          <span className="login-wordmark text-sm font-bold uppercase tracking-[0.14em]">
            Enterprise Deal Commander
          </span>
        </div>

        {/* --j drives the cascade's stagger (index.css: 250ms + j * 80ms).
            The indices are the reading order of the panel, so the wave walks
            the value proposition top-to-bottom and hands off to the card. */}
        <div className="relative max-w-sm">
          <p
            className="login-rise mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-white/40"
            style={{ "--j": 0 } as CSSProperties}
          >
            Presales Command Cockpit
          </p>
          <h1
            className="login-rise mb-4 text-pretty text-4xl font-bold leading-[1.15] tracking-tight text-white"
            style={{ "--j": 1 } as CSSProperties}
          >
            Technical reality, tracked as rigorously as revenue.
          </h1>
          <p
            className="login-rise text-sm leading-relaxed text-white/60"
            style={{ "--j": 2 } as CSSProperties}
          >
            Large TCV pipelines fail from a disconnect between commercial progression and technical
            validation — not from a lack of activity.
          </p>
          <ul className="mt-7 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }, i) => (
              <li
                key={text}
                className="login-rise flex items-start gap-3 text-sm text-white/70"
                style={{ "--j": 3 + i } as CSSProperties}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p
          className="login-rise relative text-[10.5px] uppercase tracking-wider text-white/30"
          style={{ "--j": 3 + HIGHLIGHTS.length } as CSSProperties}
        >
          Internal use only &middot; ManageEngine Enterprise Deal Commander
        </p>
      </aside>

      {/* Form column */}
      <div
        className="flex flex-1 items-center justify-center px-4 py-12"
        style={{
          paddingTop: "max(3rem, env(safe-area-inset-top))",
          paddingBottom: "max(3rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="w-full max-w-[400px]">
          {/* The rail's lockup is gone below lg, so restate it above the card.
              This is also the only piece of the entrance that survives on a
              phone — the rail, its glow and the whole cascade are display:none
              there — which is why the mark animates rather than just fading. */}
          <div
            className="mb-8 flex flex-col items-center gap-3 text-center text-white lg:hidden"
            style={ACCENT_SCOPE}
          >
            <EdcLogoMark size={56} timeScale={LOGO_TIME_SCALE} />
            <span className="login-wordmark text-xs font-bold uppercase leading-snug tracking-[0.16em]">
              Enterprise Deal Commander
            </span>
          </div>

          {/* Transform-only, deliberately. This card wraps Catalyst's
              cross-origin auth iframe, and it also collapses from the 340px
              skeleton reservation to the real frame height once Catalyst
              reports in. Animating height here would put that collapse and
              this spring on the same property; keeping the spring on transform
              leaves them as two separate beats. */}
          <div
            className="login-card-enter rounded-2xl border px-7 py-7 shadow-2xl"
            style={{ background: CARD_BG, borderColor: CARD_BORDER }}
          >
            <div className="mb-6">
              <h2 className="mb-1 text-[19px] font-bold text-white">Welcome back</h2>
              <p className="text-[12.5px] text-white/50">Sign in to continue.</p>
            </div>

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
                error card isn't trailed by 340px of dead space. */}
            <div className="relative">
              {status === "loading" ? (
                <>
                  <span role="status" className="sr-only">
                    Loading sign-in form…
                  </span>
                  <div className="absolute inset-x-0 top-0 space-y-3" aria-hidden="true">
                    <Skeleton className="h-3.5 w-20 bg-white/10" />
                    <Skeleton className="h-11 w-full bg-white/10" />
                    <Skeleton className="mt-2 h-11 w-full bg-white/10" />
                  </div>
                </>
              ) : null}
              <div
                ref={slotRef}
                id={LOGIN_SLOT_ID}
                className="relative w-full [&_iframe]:!w-full [&_iframe]:!border-0 [&_iframe]:!bg-transparent"
                style={{ minHeight: status === "loading" ? IFRAME_MIN_HEIGHT : 0 }}
              />
            </div>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-white/40">
              Access is invite-only. Contact an admin if you need an account. Sessions are audited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
