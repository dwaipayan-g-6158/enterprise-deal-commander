import { Skeleton } from "@/components/ui/skeleton";
import { EdcLogoMark } from "@/components/edc-logo-mark";

/**
 * Desktop first-paint chrome. Standalone by necessity: <Layout> calls
 * useCommandPalette() (layout.tsx:194) and this renders before
 * <CommandPaletteProvider> mounts, so reusing Layout would throw. Mirrors the
 * chrome at layout.tsx:211-256 class-for-class so the real sidebar/header take
 * over with no pop. Only the page-title bar is drawn in the main area — a
 * strict subset of each page's own skeleton at the same coordinates, so the
 * frame-1 -> frame-2 transition is additive, not a swap.
 *
 * Lives outside desktop-app.tsx so App.tsx can render it as the Suspense
 * fallback while the lazy desktop chunk loads, without eagerly pulling that
 * chunk in.
 */
export function AppShellSkeleton() {
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
