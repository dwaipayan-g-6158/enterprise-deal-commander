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

export default function Settings() {
  const { data: response, isLoading } = useListEngineThresholds();
  const thresholds = response?.data || [];
  
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const updateThresholds = useUpdateEngineThresholds();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      toast({ title: "Update Failed", description: "Could not apply engine changes.", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-8">Initializing tuning console...</div>;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Engine tuning, automation, and integrations</p>
      </div>

      <Tabs defaultValue="thresholds" className="w-full">
        <TabsList>
          <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
          <TabsTrigger value="weights">Score Weights</TabsTrigger>
          <TabsTrigger value="patterns">Custom Patterns</TabsTrigger>
          <TabsTrigger value="alerts">Smart Alerts</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="thresholds" className="pt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!hasChanges || updateThresholds.isPending} className="gap-2">
              <Save className="w-4 h-4" />
              {updateThresholds.isPending ? "Applying..." : "Apply Changes"}
            </Button>
          </div>
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
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="weights" className="pt-4">
          <ScoringWeightsSettings />
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
      </Tabs>
    </div>
  );
}