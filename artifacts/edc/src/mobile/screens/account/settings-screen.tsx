import { Redirect } from "wouter";
import { cn } from "@/lib/utils";
import { compactCurrency, formatDate, formatDateTime, humanizeCode } from "@/lib/format";
import {
  useGetEngagement,
  useListPipelineTargets,
  useListSettingsChangeLog,
  useListTeamMembers,
  useListUsers,
} from "@workspace/api-client-react";
import { formatChangeValue } from "@/components/settings/change-log-model";
import { HEALTH_CLASS } from "@/lib/semantic-colors";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MetaChip } from "@/mobile/components/badges";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { settingsScreenById } from "@/mobile/nav/routes";

const CHANGE_LOG_LIMIT = 40;

/**
 * The five read-only settings screens, behind one route.
 *
 * Every one of them is a question with an answer rather than a form. The other
 * five desktop tabs — thresholds, score weights, custom patterns, smart alerts,
 * webhooks — are authoring surfaces whose every control is a write this shell
 * does not ship, and they stay on desktop with that reason stated rather than
 * appearing here as five screens of inert inputs.
 */
export function SettingsScreen({ screenId }: { screenId: string }) {
  const screen = settingsScreenById(screenId);

  // `transition={false}` because <Redirect> navigates from a layout effect,
  // where aroundNav's flushSync is not safe to call.
  if (!screen) return <Redirect to="/account" transition={false} />;

  return (
    <>
      <MNavBar title={screen.title} backHref="/account" backLabel="Back to account" />
      {screen.id === "change-log" ? (
        <ChangeLog />
      ) : screen.id === "users" ? (
        <Users />
      ) : screen.id === "team" ? (
        <Team />
      ) : screen.id === "targets" ? (
        <Targets />
      ) : (
        <Achievements />
      )}
    </>
  );
}

/**
 * What changed in the engine's configuration, and who changed it.
 *
 * The most phone-shaped settings question there is: it gets asked when an alert
 * fires differently than expected, which is rarely at a desk. Rollback is
 * deliberately absent — `canRollback` exists in the shared model, but undoing a
 * threshold change from a phone is a write with portfolio-wide consequences and
 * no room to explain them.
 */
function ChangeLog() {
  const query = useListSettingsChangeLog({ limit: CHANGE_LOG_LIMIT });
  const entries = query.data?.data ?? [];

  return (
    <PullToRefresh onRefresh={query.refetch}>
      <div className="space-y-3 p-4">
        {query.isError ? (
          <ErrorState
            title="Couldn't load the change log"
            body="Pull down to try again, or check your connection."
          />
        ) : query.isLoading ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : entries.length === 0 ? (
          <EmptyState
            title="No configuration changes"
            body="The engine is running on its defaults."
          />
        ) : (
          <MobileCard>
            <ul className="space-y-4">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="m-label m-muted min-w-0 flex-1 truncate">
                      {humanizeCode(entry.module)}
                      {entry.rollbackOf ? " · rollback" : ""}
                    </p>
                    <span className="m-caption m-muted shrink-0">
                      {formatDateTime(entry.changedAt, "—")}
                    </span>
                  </div>
                  <p className="m-headline mt-0.5 text-pretty">
                    {humanizeCode(entry.settingKey)}
                  </p>
                  {/* formatChangeValue is the shared model the desktop tab uses,
                      so a nested payload renders identically on both shells
                      rather than as [object Object] on one of them. */}
                  <p className="m-body mt-0.5 text-pretty">
                    <span className="m-muted line-through">
                      {formatChangeValue(entry.oldValue)}
                    </span>
                    {"  →  "}
                    <span>{formatChangeValue(entry.newValue)}</span>
                  </p>
                  <p className="m-caption m-muted mt-0.5">
                    {entry.actor}
                    {entry.reason ? ` — ${entry.reason}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </MobileCard>
        )}
      </div>
    </PullToRefresh>
  );
}

/**
 * Who can write, and who is read-only.
 *
 * A hallway question, and the reason this screen exists at all: when somebody
 * cannot save something, the next thing anyone wants to know is who can.
 * Read-only here — promoting a user is a permission change, and the one write
 * this shell would least like to ship by accident.
 */
function Users() {
  const query = useListUsers();
  const users = query.data?.data ?? [];
  const admins = users.filter((u) => u.role === "admin" && u.isActive);

  return (
    <PullToRefresh onRefresh={query.refetch}>
      <div className="space-y-3 p-4">
        {query.isError ? (
          <ErrorState
            title="Couldn't load users"
            body="This needs admin access. Pull down to try again."
          />
        ) : query.isLoading ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : users.length === 0 ? (
          <EmptyState title="No users" body="Nobody has signed in to this workspace yet." />
        ) : (
          <>
            <MobileCard>
              <CardHeader label="Who can write" />
              <p className="m-hero m-num">{admins.length}</p>
              <p className="m-caption m-muted mt-1">
                of {users.length} {users.length === 1 ? "person" : "people"}
              </p>
            </MobileCard>

            <MobileCard>
              <CardHeader label="Everyone" />
              <ul className="space-y-3">
                {users.map((user) => (
                  <li key={user.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="m-headline min-w-0 flex-1 truncate">
                        {user.displayName || user.email}
                      </span>
                      <MetaChip className="shrink-0 rounded-full px-2.5 py-0.5">
                        {user.role === "admin" ? "Admin" : "Read-only"}
                      </MetaChip>
                    </div>
                    <p className="m-caption m-muted mt-0.5 truncate">{user.email}</p>
                    {!user.isActive || user.isPending ? (
                      <p className={cn("m-caption mt-0.5", HEALTH_CLASS.YELLOW.text)}>
                        {user.isPending ? "Invited, not signed in yet" : "Deactivated"}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </MobileCard>
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

/** Who deals can be assigned to, and in which capacity. */
function Team() {
  const query = useListTeamMembers();
  const members = query.data?.data ?? [];

  return (
    <PullToRefresh onRefresh={query.refetch}>
      <div className="space-y-3 p-4">
        {query.isError ? (
          <ErrorState
            title="Couldn't load the team"
            body="Pull down to try again, or check your connection."
          />
        ) : query.isLoading ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : members.length === 0 ? (
          <EmptyState
            title="No team members"
            body="Deals need somebody to assign as account manager and technical lead."
          />
        ) : (
          <MobileCard>
            <ul className="space-y-3">
              {members.map((member) => (
                <li key={member.id}>
                  <p className="m-headline truncate">{member.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {member.can_be_am ? <MetaChip>Account manager</MetaChip> : null}
                    {member.can_be_tl ? <MetaChip>Technical lead</MetaChip> : null}
                    {!member.can_be_am && !member.can_be_tl ? (
                      <span className="m-caption m-muted">No assignable role</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </MobileCard>
        )}
      </div>
    </PullToRefresh>
  );
}

/**
 * The revenue numbers coverage is measured against.
 *
 * Worth a screen because the Pulse block's coverage ratio is meaningless without
 * its denominator — "2.4× of target" invites the question "of what target", and
 * this is where it is answered.
 */
function Targets() {
  const query = useListPipelineTargets();
  const targets = [...(query.data?.data ?? [])].sort((a, b) =>
    b.periodStart.localeCompare(a.periodStart),
  );

  return (
    <PullToRefresh onRefresh={query.refetch}>
      <div className="space-y-3 p-4">
        {query.isError ? (
          <ErrorState
            title="Couldn't load targets"
            body="Pull down to try again, or check your connection."
          />
        ) : query.isLoading ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : targets.length === 0 ? (
          <EmptyState
            title="No targets set"
            body="Without a target there is no denominator, so coverage cannot be reported."
          />
        ) : (
          <MobileCard>
            <ul className="space-y-3">
              {targets.map((target) => (
                <li key={target.id} className="flex items-baseline justify-between gap-3">
                  <span className="m-body min-w-0 flex-1 truncate">
                    {formatDate(target.periodStart, "—")}
                    <span className="m-muted"> · {humanizeCode(target.periodType)}</span>
                  </span>
                  <span className="m-headline m-num shrink-0">
                    {compactCurrency(target.targetValue)}
                  </span>
                </li>
              ))}
            </ul>
          </MobileCard>
        )}
      </div>
    </PullToRefresh>
  );
}

interface AchievementEntry {
  code: string;
  name: string;
  description: string;
  earnedAt: string | null;
  locked: boolean;
}

/**
 * What has been earned.
 *
 * Locked entries show a name and nothing else — the description is withheld so
 * discovery stays part of it, which is presentation rather than a boundary and
 * matches the desktop tab exactly. Earned first, because a list that opens on
 * five locked rows reads as a scoreboard of failures.
 */
function Achievements() {
  const query = useGetEngagement();
  const all =
    ((query.data?.data as { achievements?: AchievementEntry[] } | undefined)?.achievements ??
      []) as AchievementEntry[];
  const earned = all.filter((a) => !a.locked);
  const locked = all.filter((a) => a.locked);

  return (
    <PullToRefresh onRefresh={query.refetch}>
      <div className="space-y-3 p-4">
        {query.isError ? (
          <ErrorState
            title="Couldn't load achievements"
            body="Pull down to try again, or check your connection."
          />
        ) : query.isLoading ? (
          <Shimmer className="h-40 rounded-xl" />
        ) : all.length === 0 ? (
          <EmptyState title="Nothing earned yet" body="Keep going." />
        ) : (
          <>
            <MobileCard>
              <CardHeader label="Earned" />
              {earned.length === 0 ? (
                <p className="m-body m-muted">Nothing yet. Keep going.</p>
              ) : (
                <ul className="space-y-3">
                  {earned.map((achievement) => (
                    <li key={achievement.code}>
                      <p className="m-headline">{achievement.name}</p>
                      <p className="m-body m-muted mt-0.5 text-pretty">
                        {achievement.description}
                      </p>
                      {achievement.earnedAt ? (
                        <p className="m-caption m-muted mt-0.5">
                          {formatDate(achievement.earnedAt, "—")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </MobileCard>

            {locked.length > 0 ? (
              <MobileCard>
                <CardHeader label={`Still to earn (${locked.length})`} />
                <ul className="space-y-1.5">
                  {locked.map((achievement) => (
                    <li key={achievement.code} className="m-body m-muted truncate">
                      {achievement.name}
                    </li>
                  ))}
                </ul>
              </MobileCard>
            ) : null}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
