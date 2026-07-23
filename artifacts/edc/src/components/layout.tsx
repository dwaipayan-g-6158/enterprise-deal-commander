import { useState, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LogOut, LayoutDashboard, Briefcase, BarChart, Settings, Activity, TrendingUp, BookMarked, Menu } from "lucide-react";
import { useLogout, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { EdcLogoMark } from "./edc-logo-mark";
import { useIdleStatus } from "@/lib/presence/use-idle-status";
import { useFocusMode } from "@/lib/presence/focus-mode-context";
import { pickDailyQuote } from "@/lib/quotes/quote-rotation";
import { defaultStore } from "@/lib/storage";

const navItems = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/deals", label: "Deals", icon: Briefcase },
  { href: "/portfolio", label: "Portfolio", icon: BarChart },
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/autopsy", label: "Autopsy", icon: Activity },
  { href: "/memory", label: "Deal Memory", icon: BookMarked },
  { href: "/settings", label: "Settings", icon: Settings },
];

function initialsFrom(displayName?: string, email?: string): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  if (email && email.length > 0) return email[0].toUpperCase();
  return "?";
}

// Profile Presence status line (PRD 4.12). Active/Away is auto-detected;
// Focus Mode is a manual override the commander toggles here — it also
// suppresses the sidebar quote, CelebrationWatcher's toasts, and the
// DailyBar insight segment (see Task 8), so this doubles as a real "just
// show me the work" control, not a cosmetic label.
function PresenceStatusLine() {
  const { enabled: focusMode, toggle } = useFocusMode();
  const idleStatus = useIdleStatus();
  const label = focusMode ? "Focus Mode" : idleStatus === "active" ? "Active" : "Away";
  const dotClass = focusMode
    ? "bg-primary"
    : idleStatus === "active"
      ? "bg-emerald-500"
      : "bg-muted-foreground";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm min-h-6"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="text-sm font-medium">Focus Mode</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Hides celebration toasts, the daily insight, the quote line, and personality messages.
          Alerts, next actions, and deal data stay exactly as they are.
        </p>
        <Button
          type="button"
          variant={focusMode ? "default" : "outline"}
          size="sm"
          className="mt-3 w-full min-h-[44px]"
          onClick={toggle}
        >
          {focusMode ? "Turn off Focus Mode" : "Turn on Focus Mode"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// Random Professional Quotes (PRD 4.5) — one per local day, hidden under
// Focus Mode. Locked once per mount, matching PersonalityLine's convention.
function SidebarQuoteLine() {
  const { enabled: focusMode } = useFocusMode();
  const [quote] = useState(() => pickDailyQuote(defaultStore, new Date()));

  if (focusMode) return null;

  return (
    <p className="text-[11px] text-muted-foreground italic mt-2 leading-snug">
      &ldquo;{quote.text}&rdquo;
      {quote.author && <span className="not-italic"> — {quote.author}</span>}
    </p>
  );
}

function SidebarBody({ location, user, onNavigate, onLogout }: {
  location: string;
  user: { email?: string; role?: string; displayName?: string } | undefined;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  // The command palette binds both ⌘K and Ctrl+K; show the key that matches the
  // user's OS so the hint isn't Mac-only.
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(
      navigator.platform || navigator.userAgent || "",
    );
  return (
    <>
      <div className="p-6 border-b border-border flex items-center gap-3">
        <EdcLogoMark size={52} animated={true} className="shrink-0" />
        <div className="min-w-0">
          <Link href="/" onClick={onNavigate}>
            <h1 className="text-sm font-bold tracking-tight text-foreground leading-snug cursor-pointer hover:text-primary transition-colors">Enterprise Deal Commander</h1>
          </Link>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-mono">Commander Console</p>
          <SidebarQuoteLine />
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}>
              <span className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border space-y-2">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider px-1 pb-1">
          <span>Press</span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground">
            {isMac ? "⌘" : "Ctrl"}
          </kbd>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground">
            K
          </kbd>
          <span>for quick search</span>
        </p>
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
            aria-hidden
          >
            {initialsFrom(user?.displayName, user?.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.displayName || user?.email}</p>
            <PresenceStatusLine />
          </div>
        </div>
        <ThemeToggle />
        <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  // Skip the (uncacheable) /auth/me request when offline so it doesn't fail in a
  // loop; the cockpit still renders from cached reads.
  const { data: user } = useGetMe({
    query: {
      enabled: typeof navigator === "undefined" ? true : navigator.onLine,
      queryKey: getGetMeQueryKey(),
    },
  });
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      queryClient.clear();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.includes("edc-api-reads")).map((k) => caches.delete(k)));
      }
      setLocation("/login");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {!isMobile && (
        <aside className="w-64 border-r border-border bg-card flex flex-col">
          <SidebarBody location={location} user={user} onLogout={handleLogout} />
        </aside>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        {isMobile && (
          <header
            className="flex items-center gap-3 border-b border-border bg-card px-4 h-14"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "max(1rem, env(safe-area-inset-left))" }}
          >
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 flex flex-col">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarBody
                  location={location}
                  user={user}
                  onNavigate={() => setNavOpen(false)}
                  onLogout={handleLogout}
                />
              </SheetContent>
            </Sheet>
            <EdcLogoMark size={24} animated={false} />
            <span className="font-bold tracking-tight text-foreground text-sm">Enterprise Deal Commander</span>
          </header>
        )}
        <main className="flex-1 overflow-auto bg-background [scrollbar-gutter:stable]">
          <div className="h-full @container">{children}</div>
        </main>
      </div>
    </div>
  );
}
