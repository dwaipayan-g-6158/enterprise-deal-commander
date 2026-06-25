import { useState, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LogOut, LayoutDashboard, Briefcase, BarChart, Settings, Activity, TrendingUp, BookMarked, Menu } from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/deals", label: "Deals", icon: Briefcase },
  { href: "/portfolio", label: "Portfolio", icon: BarChart },
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/autopsy", label: "Autopsy", icon: Activity },
  { href: "/memory", label: "Deal Memory", icon: BookMarked },
  { href: "/settings", label: "Settings", icon: Settings },
];

function SidebarBody({ location, user, onNavigate, onLogout }: {
  location: string;
  user: { email?: string; role?: string } | undefined;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold tracking-tight text-primary">EDC</h1>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-mono">Commander Console</p>
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
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-1 pb-1">
          Press <kbd className="font-mono">Cmd K</kbd> for quick search
        </p>
        <div className="mb-2">
          <p className="text-sm font-medium">{user?.email}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
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
  const { data: user } = useGetMe();
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
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
          <header className="flex items-center gap-3 border-b border-border bg-card px-4 h-14">
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
            <span className="font-bold tracking-tight text-primary">EDC</span>
          </header>
        )}
        <main className="flex-1 overflow-auto bg-background">
          <div className="h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
