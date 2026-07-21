import { useState } from "react";
import { Link } from "wouter";
import {
  useGetProductMix,
  type ProductMixDeal,
  type ProductWhitespace,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRight, Layers, Grid3x3, ArrowUpRight } from "lucide-react";
import { groupProductsBySuite } from "./product-picker";

// Suite accent — a single hue per suite, used sparingly (dots, bar fills) so it
// reads as data, not chrome, against the app's neutral palette.
const SUITE_ACCENT: Record<string, { bar: string; dot: string; text: string }> = {
  AD360: {
    bar: "bg-indigo-500/80",
    dot: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-400",
  },
  Log360: {
    bar: "bg-cyan-500/80",
    dot: "bg-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
  },
};
const fallbackAccent = {
  bar: "bg-muted-foreground/50",
  dot: "bg-muted-foreground",
  text: "text-muted-foreground",
};
const accentFor = (suite: string) => SUITE_ACCENT[suite] ?? fallbackAccent;

function compactUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** A clickable row of deals that drilled-down panels share. */
function DealList({ deals }: { deals: ProductMixDeal[] }) {
  if (deals.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">Nothing here yet.</p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {deals.map((d) => (
        <li key={d.id}>
          <Link
            href={`/deals/${d.id}`}
            className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium group-hover:underline">
                {d.dealName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {d.accountName} · {d.salesStage}
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {compactUSD(d.tcv)}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ProductMixSection() {
  const { data, isLoading } = useGetProductMix();
  const mix = data?.data;

  const [openSuite, setOpenSuite] = useState<string | null>(null);
  const [openProduct, setOpenProduct] = useState<string | null>(null);

  if (isLoading || !mix) {
    return (
      <Card className="xl:col-span-2">
        <CardContent className="p-6 text-sm text-muted-foreground">
          {isLoading ? "Loading product mix…" : "Product mix will appear here once deals are active."}
        </CardContent>
      </Card>
    );
  }

  const maxTCV = Math.max(1, ...mix.pipelineBySuite.map((s) => s.totalTCV));
  const grouped = groupProductsBySuite(mix.productWhitespace);

  return (
    <>
      {/* ---- Pipeline by Suite ---------------------------------------- */}
      <Card className="xl:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Pipeline by Suite
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Total contract value across {mix.totalActiveDeals} active deals —
              select a suite to inspect its deals.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {mix.pipelineBySuite.length === 0 && (
            <p className="text-sm text-muted-foreground">No suite activity yet. Add a deal to get things moving.</p>
          )}
          {mix.pipelineBySuite.map((s) => {
            const accent = accentFor(s.suite);
            const isOpen = openSuite === s.suite;
            const pct = (s.totalTCV / maxTCV) * 100;
            return (
              <div key={s.suite} className="rounded-md border">
                <button
                  type="button"
                  onClick={() => setOpenSuite(isOpen ? null : s.suite)}
                  aria-expanded={isOpen}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted/50",
                    isOpen && "bg-muted/40",
                  )}
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", accent.dot)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{s.suite}</span>
                      <span className="font-mono text-sm tabular-nums">
                        {compactUSD(s.totalTCV)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all", accent.bar)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                    {s.dealCount} {s.dealCount === 1 ? "deal" : "deals"}
                  </Badge>
                </button>
                {isOpen && (
                  <div className="border-t bg-card">
                    <DealList deals={s.deals} />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ---- Product Whitespace Heatmap ------------------------------- */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4 text-muted-foreground" />
            Product Whitespace
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Attach rate across {mix.totalActiveDeals} active deals — colder cells
            are untapped whitespace. Select a product to see its open accounts.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {grouped.map(({ suite, products }) => {
            const accent = accentFor(suite);
            return (
              <div key={suite} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", accent.dot)} />
                  <span className={cn("text-xs font-semibold uppercase tracking-wide", accent.text)}>
                    {suite}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {products.map((p) => (
                    <WhitespaceCell
                      key={p.productName}
                      product={p}
                      open={openProduct === p.productName}
                      onToggle={() =>
                        setOpenProduct(
                          openProduct === p.productName ? null : p.productName,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Drill-down for the selected product */}
          {(() => {
            const sel = mix.productWhitespace.find((p) => p.productName === openProduct);
            if (!sel) return null;
            return (
              <div className="rounded-md border">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-sm font-semibold">{sel.productName}</span>
                  <span className="text-xs text-muted-foreground">
                    {sel.whitespaceDeals.length} open ·{" "}
                    {sel.pitchedDealCount} attached
                  </span>
                </div>
                {sel.whitespaceDeals.length > 0 ? (
                  <>
                    <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
                      Whitespace — deals without {sel.productName} pitched
                    </p>
                    <DealList deals={sel.whitespaceDeals} />
                  </>
                ) : (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    {sel.productName} is pitched in every active deal — no
                    whitespace.
                  </p>
                )}
              </div>
            );
          })()}

          <HeatLegend />
        </CardContent>
      </Card>
    </>
  );
}

// Attach % → border + tint. Low attach = whitespace opportunity (warm), high = cool/calm.
function heatClasses(attachPct: number): string {
  if (attachPct >= 0.6)
    return "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15";
  if (attachPct >= 0.3)
    return "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15";
  if (attachPct > 0)
    return "border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/15";
  return "border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15";
}

function WhitespaceCell({
  product,
  open,
  onToggle,
}: {
  product: ProductWhitespace;
  open: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(product.attachPct * 100);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors",
        heatClasses(product.attachPct),
        open && "ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium leading-tight">{product.productName}</p>
        <span className="font-mono text-xs font-semibold tabular-nums">{pct}%</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {product.pitchedDealCount}/{product.totalDeals} attached
        {product.interestedDealCount > 0 && (
          <> · {product.interestedDealCount} interested</>
        )}
      </p>
    </button>
  );
}

function HeatLegend() {
  const items = [
    { label: "No attach", cls: "bg-rose-500/40" },
    { label: "Low", cls: "bg-orange-500/40" },
    { label: "Moderate", cls: "bg-amber-500/40" },
    { label: "Strong", cls: "bg-emerald-500/40" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      <span className="font-medium">Attach rate:</span>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", i.cls)} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
