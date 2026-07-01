import { useSearchDealMemory } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AutopsyForm } from "@/components/memory/autopsy-form";

export function LossAutopsySheet({
  dealId,
  dealName,
  open,
  onOpenChange,
}: {
  dealId: string;
  dealName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: memorySearch } = useSearchDealMemory({ outcome: "Lost" });
  const memoryRow = memorySearch?.data?.find((m) => m.dealId === dealId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Complete Autopsy — {dealName}</SheetTitle>
          <SheetDescription>Structured loss capture beyond the reason dropdown.</SheetDescription>
        </SheetHeader>
        <div className="py-6">
          <AutopsyForm dealId={dealId} dealName={dealName} memoryRow={memoryRow} onSaved={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
