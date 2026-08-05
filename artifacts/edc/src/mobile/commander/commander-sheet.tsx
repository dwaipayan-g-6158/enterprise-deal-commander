import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search, Sparkles, ArrowDownToLine, Moon, Sun, LogOut, BellDot } from "lucide-react";
import { useTheme } from "next-themes";
import { useListDeals } from "@workspace/api-client-react";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { toast } from "@/hooks/use-toast";
import {
  badgeEnabled,
  badgeSupported,
  clearBadge,
  disableBadge,
  enableBadge,
} from "@/mobile/lib/app-badge";
import { haptic } from "@/mobile/lib/haptics";
import {
  parseNlcConditions,
  matchNlcDeals,
  describeNlcConditions,
} from "@/lib/nlc-filter";
import { compactCurrency } from "@/lib/format";
import { MOBILE_TABS } from "@/mobile/lib/mobile-nav";
import { useCommander } from "@/mobile/commander/commander-context";
import { SectionSheet } from "@/mobile/components/section-sheet";
import { ListRow } from "@/mobile/components/list-row";
import { HealthDot } from "@/mobile/components/badges";

/** Name matches shown before the list gets longer than it is useful. */
const MAX_DEAL_MATCHES = 8;

/**
 * What the Commander capsule opens: search, natural-language questions, jumps
 * within the current screen, and the two account actions.
 *
 * Deliberately not the desktop command palette — that mounts cmdk's dialog and
 * a keyboard-first interaction model. This is a bottom sheet you can drag, with
 * targets sized for a thumb.
 */
export function CommanderSheet() {
  const { open, setOpen, jumpTargets } = useCommander();
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const signOut = useSignOut();
  const [badgeOn, setBadgeOn] = useState(badgeEnabled);

  // Archived deals stay findable by name, matching the desktop palette.
  const { data } = useListDeals({ state: "all", limit: 50 });
  const deals = data?.data ?? [];

  const trimmed = query.trim();
  const conditions = useMemo(() => parseNlcConditions(trimmed), [trimmed]);
  const nlcMatches = useMemo(
    () => matchNlcDeals(deals.filter((d) => !d.archivedAt), conditions),
    [deals, conditions],
  );

  const nameMatches = useMemo(() => {
    if (trimmed.length < 2) return [];
    const needle = trimmed.toLowerCase();
    return deals
      .filter(
        (d) =>
          d.dealName.toLowerCase().includes(needle) ||
          d.accountName.toLowerCase().includes(needle),
      )
      .slice(0, MAX_DEAL_MATCHES);
  }, [deals, trimmed]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const go = (path: string) => {
    close();
    navigate(path);
  };

  /**
   * The badge opt-in. The row says what the permission is for before it asks,
   * because iOS only ever asks once — a decline here is permanent until the
   * user goes into Settings, which is what the message below tells them.
   */
  const toggleBadge = async () => {
    if (badgeOn) {
      await disableBadge();
      setBadgeOn(false);
      return;
    }
    const result = await enableBadge();
    if (result === "enabled") {
      setBadgeOn(true);
      toast({
        title: "Alert count is on",
        description: "The app icon will show how many deals are in the red.",
      });
      return;
    }
    toast({
      title: "Notifications are off for this app",
      description:
        result === "denied"
          ? "iOS only asks once. Turn notifications on in Settings to show the count."
          : "This device can't show a count on the app icon.",
      variant: "destructive",
    });
  };

  const jumpTo = (anchorId: string) => {
    close();
    // Deferred a tick: the sheet's closing animation and the scroll would
    // otherwise fight over the same frame.
    setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <SectionSheet
      open={open}
      onOpenChange={(next) => {
        haptic();
        if (next) setOpen(true);
        else close();
      }}
      title="Commander"
      description="Search deals, ask a question, or jump to a section."
    >
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4">
        <Search className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
        <label className="sr-only" htmlFor="commander-search">
          Search deals or ask a question
        </label>
        <input
          id="commander-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A deal, or: red deals above $1M"
          autoComplete="off"
          // 16px minimum, or iOS zooms the viewport on focus.
          className="m-tap h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </div>

      {conditions.length > 0 ? (
        <Group label={`Interpreted: ${describeNlcConditions(conditions)} (${nlcMatches.length})`}>
          {nlcMatches.length === 0 ? (
            <p className="m-body m-muted px-1 py-2">No deals match that.</p>
          ) : (
            nlcMatches.map((deal) => (
              <Row
                key={`nlc-${deal.id}`}
                icon={<Sparkles className="h-4 w-4 text-primary" />}
                label={deal.dealName}
                detail={compactCurrency(deal.calculatedTCV ?? 0, deal.dealCurrency ?? "USD")}
                onPress={() => go(`/deals/${deal.id}`)}
              />
            ))
          )}
        </Group>
      ) : null}

      {nameMatches.length > 0 ? (
        <Group label="Deals">
          {nameMatches.map((deal) => (
            <Row
              key={deal.id}
              icon={<HealthDot health={deal.healthStatus} />}
              label={deal.dealName}
              sub={deal.accountName}
              detail={compactCurrency(deal.calculatedTCV ?? 0, deal.dealCurrency ?? "USD")}
              onPress={() => go(`/deals/${deal.id}`)}
            />
          ))}
        </Group>
      ) : null}

      {trimmed.length === 0 && jumpTargets.length > 0 ? (
        <Group label="On this screen">
          {jumpTargets.map((target) => (
            <Row
              key={target.anchorId}
              icon={<ArrowDownToLine className="m-muted h-4 w-4" />}
              label={target.label}
              detail={target.detail}
              onPress={() => jumpTo(target.anchorId)}
            />
          ))}
        </Group>
      ) : null}

      {trimmed.length === 0 ? (
        <>
          <Group label="Go to">
            {MOBILE_TABS.map((tab) => (
              <Row
                key={tab.id}
                icon={<tab.icon className="m-muted h-4 w-4" />}
                label={tab.label}
                onPress={() => go(tab.href)}
              />
            ))}
          </Group>

          <Group label="Account">
            <Row
              icon={
                resolvedTheme === "dark" ? (
                  <Sun className="m-muted h-4 w-4" />
                ) : (
                  <Moon className="m-muted h-4 w-4" />
                )
              }
              label={resolvedTheme === "dark" ? "Switch to light" : "Switch to dark"}
              onPress={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            />
            {/* Absent entirely where the platform can't badge an icon, rather
                than present and inert. */}
            {badgeSupported() ? (
              <Row
                icon={<BellDot className="m-muted h-4 w-4" />}
                label={
                  badgeOn ? "Hide alert count on app icon" : "Show alert count on app icon"
                }
                sub={badgeOn ? undefined : "Needs notification permission"}
                onPress={() => void toggleBadge()}
              />
            ) : null}
            <Row
              icon={<LogOut className="m-muted h-4 w-4" />}
              label="Sign out"
              onPress={() => {
                close();
                // A count left on the icon after sign-out reports someone
                // else's pipeline on a shared device.
                void clearBadge();
                signOut();
              }}
            />
          </Group>
        </>
      ) : null}

      {trimmed.length >= 2 && nameMatches.length === 0 && conditions.length === 0 ? (
        <p className="m-body m-muted px-1 py-6 text-center">
          Nothing matches that. Try an account name, or ask for red deals above $1M.
        </p>
      ) : null}
    </SectionSheet>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-4">
      <p className="m-label m-muted mb-1.5">{label}</p>
      <ul>{children}</ul>
    </section>
  );
}

function Row({
  icon,
  label,
  sub,
  detail,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <li>
      <ListRow onPress={onPress} media={icon} title={label} sub={sub} trailing={detail} />
    </li>
  );
}
