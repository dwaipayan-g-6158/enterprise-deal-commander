import { useEffect, useState } from "react";
import {
  useListCrossSells,
  useListProductCatalog,
  useUpdateCrossSells,
  useGetDealIntelligence,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCockpitInvalidate } from "./use-invalidate";
import { groupProductsBySuite } from "./product-picker";

export function CrossSellPanel({ dealId }: { dealId: string }) {
  const { toast } = useToast();
  const invalidate = useCockpitInvalidate(dealId);
  const { data: crossSells } = useListCrossSells(dealId);
  const { data: catalog } = useListProductCatalog();
  const { data: intel } = useGetDealIntelligence(dealId);
  const updateCrossSells = useUpdateCrossSells();

  // Products the engine recommends attaching — highlighted as "Recommended".
  const recommendedIds = new Set(
    (intel?.data?.recommendations ?? []).flatMap((r) =>
      (r.products ?? []).map((p) => p.productId),
    ),
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (crossSells?.data) {
      setSelected(new Set(crossSells.data.filter((c) => c.isPitched).map((c) => c.productId)));
    }
  }, [crossSells?.data]);

  const products = catalog?.data ?? [];
  const initial = new Set((crossSells?.data ?? []).filter((c) => c.isPitched).map((c) => c.productId));
  const dirty =
    selected.size !== initial.size || [...selected].some((id) => !initial.has(id));

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    try {
      await updateCrossSells.mutateAsync({ dealId, data: { product_ids: [...selected] } });
      await invalidate();
      toast({ title: "Cross-sell updated", description: "Pitched products saved." });
    } catch {
      toast({ title: "Failed", description: "Could not update cross-sell.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="font-semibold text-sm">Cross-Sell Opportunities</p>
        <div className="space-y-3">
          {groupProductsBySuite(products).map(({ suite, products: items }) => (
            <div key={suite} className="space-y-1">
              <Badge variant="secondary" className="text-xs">
                {suite}
              </Badge>
              {items.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{p.productName}</p>
                      {recommendedIds.has(p.id) && !selected.has(p.id) && (
                        <Badge className="text-[10px]">Recommended</Badge>
                      )}
                    </div>
                    {p.productCategory && (
                      <p className="text-xs text-muted-foreground">{p.productCategory}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>
        <Button size="sm" onClick={save} disabled={!dirty || updateCrossSells.isPending}>
          {updateCrossSells.isPending ? "Saving..." : "Save Pitched Products"}
        </Button>
      </CardContent>
    </Card>
  );
}
