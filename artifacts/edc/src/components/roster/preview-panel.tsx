import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PreviewContent } from "./preview-content";
import type { RosterRow } from "./model/roster-types";

// Quick-look preview. Always a right-side Sheet overlay so opening it never
// resizes or reflows the underlying table. Esc / outside-click close it (the
// Sheet handles both natively).
export function PreviewPanel({
  row,
  onClose,
}: {
  row: RosterRow | undefined;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Deal preview</SheetTitle>
          <SheetDescription>
            {row ? `${row.dealName} — ${row.accountName}` : "Deal details"}
          </SheetDescription>
        </SheetHeader>
        {row && (
          <div className="mt-4">
            <PreviewContent row={row} variant="panel" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
