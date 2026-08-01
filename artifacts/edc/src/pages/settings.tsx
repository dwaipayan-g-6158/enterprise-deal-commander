import { useState, useEffect } from "react";
import { useListEngineThresholds, useUpdateEngineThresholds, getListEngineThresholdsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WebhooksSettings,
  NotificationSettings,
  CustomPatternsSettings,
} from "@/components/settings/v2-panels";
import { TeamSettings } from "@/components/settings/team-settings";
import { TargetsSettings } from "@/components/settings/targets-settings";
import { ScoringWeightsSettings } from "@/components/settings/scoring-weights-settings";
import { AchievementsSettings } from "@/components/settings/achievements-settings";
import { UsersSettings } from "@/components/settings/users-settings";
import { ChangeLogSettings } from "@/components/settings/change-log-settings";
import { AdminOnly, ReadOnlyNotice } from "@/components/auth/write-gate";
import { useCanWrite } from "@/lib/auth/role-context";
import { serverMessage } from "@/lib/server-message";
import { shouldConfirmTabSwitch } from "./settings-model";

export default function Settings() {
  const canWrite = useCanWrite();
  const { data: response, isLoading } = useListEngineThresholds();
  const thresholds = response?.data || [];

  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const updateThresholds = useUpdateEngineThresholds();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Radix Tabs unmounts inactive TabsContent, so any component state that
  // lives *inside* a tab's own subtree vanishes silently the instant the
  // user clicks another tab. Score Weights' pct-editing state lives inside
  // ScoringWeightsSettings, so it's genuinely lost on unmount — its dirty
  // flag is lifted just far enough to reach this guard via onDirtyChange.
  // Thresholds is different: `localValues` below lives in this page
  // component itself (which never unmounts on a tab switch), so an edit
  // there survives switching away and back — nothing to warn about, so
  // Thresholds intentionally has no entry in dirtyByTab. The other tabs
  // either auto-save per item (Team, Webhooks, Smart Alerts, Custom
  // Patterns) or have no unsaved-input concept (Achievements, Users,
  // Change Log — its own actions are confirm-gated, not edit-then-save), so
  // they don't need an entry here either.
  const [activeTab, setActiveTab] = useState("thresholds");
  const [weightsDirty, setWeightsDirty] = useState(false);

  useEffect(() => {
    if (thresholds.length > 0) {
      const init: Record<string, string> = {};
      thresholds.forEach(t => {
        init[t.parameterKey] = t.parameterValue;
      });
      setLocalValues(init);
    }
  }, [thresholds]);

  const hasChanges = thresholds.some(t => localValues[t.parameterKey] !== undefined && localValues[t.parameterKey] !== t.parameterValue);

  const handleTabChange = (next: string) => {
    // Thresholds is deliberately excluded: its edits live in this
    // component's own state and survive a tab switch, so there is nothing
    // to discard and nothing to warn about. Only Score Weights can
    // actually lose unsaved input on unmount.
    const dirtyByTab = { weights: weightsDirty };
    if (
      shouldConfirmTabSwitch(activeTab, next, dirtyByTab) &&
      !window.confirm("You have unsaved changes on this tab. Switch tabs and discard them?")
    ) {
      return;
    }
    setActiveTab(next);
  };

  const handleSave = async () => {
    try {
      const updates = Object.entries(localValues)
        .filter(([key, value]) => {
          const original = thresholds.find(t => t.parameterKey === key);
          return original && original.parameterValue !== value;
        })
        .map(([key, value]) => ({ parameter_key: key, parameter_value: value }));

      if (updates.length === 0) return;

      await updateThresholds.mutateAsync({ data: { updates } });
      queryClient.invalidateQueries({ queryKey: getListEngineThresholdsQueryKey() });
      toast({ title: "Thresholds Updated", description: "Engine parameters successfully tuned." });
    } catch (err) {
      toast({ title: "Update Failed", description: serverMessage(err, "Could not apply engine changes."), variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-8">Initializing tuning console...</div>;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Engine tuning, automation, and integrations</p>
      </div>

      <ReadOnlyNotice>
        You can see every tab and setting, but only an admin can change engine tuning,
        automation, or team configuration.
      </ReadOnlyNotice>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="h-auto w-fit flex-wrap justify-start gap-1">
          <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
          <TabsTrigger value="weights">Score Weights</TabsTrigger>
          <TabsTrigger value="patterns">Custom Patterns</TabsTrigger>
          <TabsTrigger value="alerts">Smart Alerts</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="change-log">Change Log</TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds" className="pt-4 space-y-4">
          <AdminOnly>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!hasChanges || updateThresholds.isPending} className="gap-2">
                <Save className="w-4 h-4" />
                {updateThresholds.isPending ? "Applying..." : "Apply Changes"}
              </Button>
            </div>
          </AdminOnly>
          <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-md">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle>Detection Thresholds</CardTitle>
              <CardDescription>Adjust how aggressive risk alerts fire</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {thresholds.map(t => (
            <div key={t.parameterKey} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-4 border rounded-lg bg-muted/20">
              <div className="md:col-span-2">
                <p className="font-medium font-mono text-sm">{t.parameterKey}</p>
                {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                <Badge variant="outline" className="mt-2 text-[10px] uppercase">{t.dataType}</Badge>
              </div>
              <div>
                <Input
                  value={localValues[t.parameterKey] || ""}
                  onChange={e => setLocalValues({ ...localValues, [t.parameterKey]: e.target.value })}
                  className="font-mono"
                  disabled={!canWrite}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="weights" className="pt-4">
          <ScoringWeightsSettings onDirtyChange={setWeightsDirty} />
        </TabsContent>
        <TabsContent value="patterns" className="pt-4">
          <CustomPatternsSettings />
        </TabsContent>
        <TabsContent value="alerts" className="pt-4">
          <NotificationSettings />
        </TabsContent>
        <TabsContent value="webhooks" className="pt-4">
          <WebhooksSettings />
        </TabsContent>
        <TabsContent value="targets" className="pt-4">
          <TargetsSettings />
        </TabsContent>
        <TabsContent value="team" className="pt-4">
          <TeamSettings />
        </TabsContent>
        <TabsContent value="achievements" className="pt-4">
          <AchievementsSettings />
        </TabsContent>
        <TabsContent value="users" className="pt-4">
          <UsersSettings />
        </TabsContent>
        <TabsContent value="change-log" className="pt-4">
          <ChangeLogSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}