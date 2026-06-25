import { useListProductCatalog } from "@workspace/api-client-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

type Product = {
  id: string;
  productName: string;
  productCategory?: string | null;
  suite?: string | null;
};

const SUITE_ORDER = ["AD360", "Log360"];

/** Group a product catalog by suite, AD360 then Log360 then anything else. */
export function groupProductsBySuite<T extends { suite?: string | null }>(
  products: T[],
): { suite: string; products: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const p of products) {
    const key = p.suite ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return [...groups.keys()]
    .sort((a, b) => {
      const ai = SUITE_ORDER.indexOf(a);
      const bi = SUITE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map((suite) => ({ suite, products: groups.get(suite)! }));
}

/**
 * Suite-grouped multi-select over the product catalog. Used for "Products of
 * Interest" (the anchor/landed set) on the create/edit deal sheets.
 */
export function ProductPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: catalog } = useListProductCatalog();
  const products = (catalog?.data ?? []) as Product[];
  const groups = groupProductsBySuite(products);
  const selectedSet = new Set(selected);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      {groups.map(({ suite, products: items }) => (
        <div key={suite} className="space-y-1.5">
          <Badge variant="secondary" className="text-xs">
            {suite}
          </Badge>
          <div className="grid grid-cols-1 gap-1">
            {items.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedSet.has(p.id)}
                  onCheckedChange={() => toggle(p.id)}
                />
                <span>{p.productName}</span>
                {p.productCategory ? (
                  <span className="text-xs text-muted-foreground">
                    {p.productCategory}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
