import { Skeleton } from "@/components/ui/skeleton";
import { EdcLogoMark } from "@/components/edc-logo-mark";

/**
 * Mobile first-paint chrome. Mirrors mobile-shell.tsx's geometry (safe-area
 * header, scrollable body, fixed tab bar) so the real shell takes over with no
 * layout pop.
 *
 * Kept eager and outside mobile-app.tsx so App.tsx can render it as the
 * Suspense fallback while the lazy mobile chunk loads. That eagerness is why
 * the mark here is static even though the live one in MNavBrand animates:
 * this component renders before the mobile chunk has downloaded, and a draw-in
 * torn down after 200ms reads as a glitch rather than a flourish. The mark the
 * user sees draw is the one that replaces this, which is the right moment for
 * it — that is also when the screen it belongs to actually exists.
 */
export function MobileShellSkeleton() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background" aria-busy="true">
      <span role="status" className="sr-only">Loading Deal Commander…</span>

      <header className="pt-safe shrink-0 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-2 px-4">
          {/* The real mark, at the size MNavBar's leading slot renders it,
              so the handover to the live shell moves nothing. */}
          <EdcLogoMark size={24} animated={false} />
          <Skeleton className="h-4 w-36" />
          {/* The avatar's stand-in, inside the same 48px tap box .m-tap gives
              the live one. Sizing it to the visible 32px disc would hand over
              16px narrower and shift the row on the swap. */}
          <div className="ml-auto flex h-12 w-12 items-center justify-center">
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden px-4 pt-4">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-3 h-10 w-56" />
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Skeleton className="col-span-2 h-32 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="col-span-2 h-40 rounded-2xl" />
        </div>
      </main>

      <nav className="pb-safe shrink-0 border-t border-border bg-card">
        <div className="flex h-16 items-stretch">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-center gap-1.5">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
