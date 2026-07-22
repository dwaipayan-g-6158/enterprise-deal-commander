import { useGetEngagement } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy } from "lucide-react";

interface Achievement {
  code: string;
  name: string;
  description: string;
  earnedAt: string | null;
  locked: boolean;
}
interface EngagementData {
  achievements: Achievement[];
}

// Elegant, not childish, per the PRD: a clean list, no badges, no
// animation, no leaderboard (free in a single-user app). Locked
// achievements show name only — the description is withheld client-side
// (not a security boundary, purely presentation) so discovery stays part
// of the experience.
export function AchievementsSettings() {
  const { data, isLoading } = useGetEngagement();
  const achievements = (data?.data as EngagementData | undefined)?.achievements ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-primary" />
          Achievements
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : achievements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing earned yet. Keep going.</p>
        ) : (
          <ul className="space-y-4">
            {achievements.map((a) => (
              <li key={a.code} className="space-y-0.5">
                <p className={a.locked ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium"}>
                  {a.locked ? "○" : "✓"} {a.name}
                </p>
                {!a.locked && <p className="text-xs text-muted-foreground">{a.description}</p>}
                {!a.locked && a.earnedAt && (
                  <p className="text-xs text-muted-foreground">
                    Earned {new Date(a.earnedAt).toLocaleDateString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
