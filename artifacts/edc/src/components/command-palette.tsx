import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useListDeals, useLogout } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Briefcase,
  BarChart,
  Activity,
  Settings,
  Moon,
  Sun,
  LogOut,
  Search,
} from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const logout = useLogout();
  const { data: deals } = useListDeals({ state: "active", limit: 50 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  const navItems = [
    { label: "Command Center", path: "/", icon: LayoutDashboard },
    { label: "Deal Roster", path: "/deals", icon: Briefcase },
    { label: "Portfolio", path: "/portfolio", icon: BarChart },
    { label: "Loss Autopsy", path: "/autopsy", icon: Activity },
    { label: "Settings", path: "/settings", icon: Settings },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search deals or jump to a page..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.path}
              value={`nav ${item.label}`}
              onSelect={() => go(item.path)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {deals?.data && deals.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Deals">
              {deals.data.map((deal) => (
                <CommandItem
                  key={deal.id}
                  value={`deal ${deal.dealName} ${deal.accountName}`}
                  onSelect={() => go(`/deals/${deal.id}`)}
                >
                  <Search className="mr-2 h-4 w-4" />
                  <span>{deal.dealName}</span>
                  <span className="ml-2 text-muted-foreground text-xs">
                    {deal.accountName}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="toggle theme dark light mode"
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle theme
          </CommandItem>
          <CommandItem
            value="logout sign out"
            onSelect={async () => {
              setOpen(false);
              try {
                await logout.mutateAsync();
                setLocation("/login");
              } catch {
                /* ignore */
              }
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
