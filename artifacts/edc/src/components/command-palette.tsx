import { useState } from "react";
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
import { useCommandPalette } from "@/lib/command-palette-context";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { useListDeals } from "@workspace/api-client-react";
import {
  parseNlcConditions,
  matchNlcDeals,
  describeNlcConditions,
} from "@/lib/nlc-filter";
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
  Sparkles,
} from "lucide-react";

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  // resolvedTheme, not theme: `theme` is "system" until the user picks a side
  // (see theme-provider.tsx), which would make the first toggle a no-op.
  const { resolvedTheme, setTheme } = useTheme();
  const signOut = useSignOut();
  const { data: deals } = useListDeals({ state: "all", limit: 50 });

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  const navItems = [
    { label: "Command Center", path: "/", icon: LayoutDashboard },
    { label: "Deal Roster", path: "/deals", icon: Briefcase },
    { label: "Portfolio", path: "/portfolio", icon: BarChart },
    { label: "Pipeline Analytics", path: "/analytics", icon: BarChart },
    { label: "Loss Autopsy", path: "/autopsy", icon: Activity },
    { label: "Deal Memory", path: "/memory", icon: Search },
    { label: "Settings", path: "/settings", icon: Settings },
  ];

  // Natural-language command parsing (V2 F19) — deterministic, client-side.
  // The matcher lives in lib/nlc-filter.ts so the mobile Commander sheet
  // answers the same question with the same set.
  const nlcConditions = parseNlcConditions(query);
  // The underlying fetch is state: "all" (active + archived) so archived
  // deals stay findable by NAME in the plain "Deals" group below — but NLC
  // answers questions about the live pipeline ("red deals above $1M"), so it
  // gets its own not-archived slice rather than inheriting "all" wholesale.
  const openDeals = (deals?.data ?? []).filter((d) => !d.archivedAt);
  const nlcMatches = matchNlcDeals(openDeals, nlcConditions);
  const nlcSummary = describeNlcConditions(nlcConditions);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search, jump to a page, or ask: red deals above $1M…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matches found.</CommandEmpty>

        {nlcConditions.length > 0 && (
          <>
            <CommandGroup heading={`Interpreted: ${nlcSummary} (${nlcMatches.length})`}>
              {nlcMatches.map((deal) => (
                <CommandItem
                  key={`nlc-${deal.id}`}
                  value={query}
                  onSelect={() => go(`/deals/${deal.id}`)}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-primary" />
                  <span>{deal.dealName}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{deal.accountName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

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
                  {deal.archivedAt && (
                    <span className="ml-2 text-muted-foreground text-xs italic">
                      Archived
                    </span>
                  )}
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
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle theme
          </CommandItem>
          <CommandItem
            value="logout sign out"
            onSelect={() => {
              setOpen(false);
              void signOut();
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
