import { useState } from "react";
import { useCreateBatSignal } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Radio, Copy, Check } from "lucide-react";

export function BatSignalDialog({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const createBatSignal = useCreateBatSignal();
  const [result, setResult] = useState<{ shareUrl: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const onGenerate = async () => {
    try {
      const res = await createBatSignal.mutateAsync({ dealId });
      setResult(res.data);
    } catch {
      toast({ title: "Bat-Signal failed", description: "Could not generate a share link.", variant: "destructive" });
    }
  };

  const onCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setResult(null);
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Bat-Signal
          </DialogTitle>
          <DialogDescription>
            Generate a secure, time-limited public link to the executive risk card for this deal.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <Button onClick={onGenerate} disabled={createBatSignal.isPending}>
            {createBatSignal.isPending ? "Generating..." : "Generate Share Link"}
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Share URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={result.shareUrl} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={onCopy}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Expires {new Date(result.expiresAt).toLocaleString()}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
