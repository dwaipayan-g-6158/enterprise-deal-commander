import { useGetDealIntelligence } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  Layers,
  ShieldAlert,
  Swords,
  ScrollText,
  CalendarClock,
} from "lucide-react";

const REC_META: Record<
  string,
  { label: string; icon: typeof Lightbulb }
> = {
  NEXT_BEST_PRODUCT: { label: "Next Best Product", icon: Lightbulb },
  SUITE_BUNDLE: { label: "Suite Bundle Upsell", icon: Layers },
  RECOVERY_GAP: { label: "Recovery Gap", icon: ShieldAlert },
};

export function NextBestAction({ dealId }: { dealId: string }) {
  const { data, isLoading } = useGetDealIntelligence(dealId);
  const intel = data?.data;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Loading guidance…
        </CardContent>
      </Card>
    );
  }

  const recommendations = intel?.recommendations ?? [];
  const battlecard = intel?.battlecard ?? null;
  const compliance = intel?.complianceGuidance ?? null;

  const empty = recommendations.length === 0 && !battlecard && !compliance;

  return (
    <div className="space-y-4">
      {empty && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No coaching signals yet. Set Products of Interest, a competitor, or a
            compliance driver on this deal to unlock next-best-action guidance.
          </CardContent>
        </Card>
      )}

      {recommendations.map((rec, i) => {
        const meta = REC_META[rec.type] ?? {
          label: rec.type,
          icon: Lightbulb,
        };
        const Icon = meta.icon;
        return (
          <Card key={`${rec.type}-${i}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <p className="font-semibold text-sm">{meta.label}</p>
                {rec.suite && (
                  <Badge variant="secondary" className="text-xs">
                    {rec.suite}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{rec.rationale}</p>
              {rec.products && rec.products.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {rec.products.map((p) => (
                    <Badge key={p.productId} variant="outline">
                      {p.productName}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {compliance && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              <p className="font-semibold text-sm">
                Compliance Leverage — {compliance.driver}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {compliance.daysToDeadline != null
                ? `Audit window closes in ${compliance.daysToDeadline} days. Use the mandate as urgency, and lead with the products that carry the ${compliance.driver} story.`
                : `Lead with the products that carry the ${compliance.driver} story.`}
            </p>
            {compliance.recommendedProductCodes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {compliance.recommendedProductCodes.map((code) => (
                  <Badge key={code} variant="outline">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {battlecard && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Swords className="h-4 w-4 text-destructive" />
              <p className="font-semibold text-sm">
                Battlecard vs {battlecard.competitor}
              </p>
            </div>
            <ul className="space-y-1.5">
              {battlecard.talkingPoints.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
