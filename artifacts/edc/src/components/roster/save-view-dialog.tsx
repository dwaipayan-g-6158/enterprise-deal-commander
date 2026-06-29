import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SaveViewDialog({
  open,
  onOpenChange,
  onSave,
  defaultName = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (name: string) => void;
  defaultName?: string;
}) {
  const [name, setName] = useState(defaultName);
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  const submit = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
          <DialogDescription>
            Saves the current filters, sort and grouping as a reusable view (stored in this browser).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="view-name">View name</Label>
          <Input
            id="view-name"
            value={name}
            autoFocus
            placeholder="e.g. My RED watchlist"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
