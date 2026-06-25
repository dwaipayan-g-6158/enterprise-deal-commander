import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EdcLogoMark } from "@/components/edc-logo-mark";
import { LogIn, Lock } from "lucide-react";

const loginSchema = z.object({
  email: z.string().min(1, "Identification is required"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const login = useLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "commander", password: "DealCommander!2026" },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    setError("");
    try {
      await login.mutateAsync({ data });
      setLocation("/");
    } catch (err: any) {
      setError(err?.error?.message || "Authentication failed");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[60%] h-[55%] rounded-full bg-primary/15 blur-[130px]" />
        <div className="absolute top-[55%] -right-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        {/* Brand above the card */}
        <div className="flex flex-col items-center mb-7">
          <EdcLogoMark size={60} animated={false} />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground text-center">
            Enterprise Deal Commander
          </p>
        </div>

        {/* Auth card */}
        <div className="w-full rounded-xl border border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="p-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your workspace to continue.</p>
            </div>
            <div
              aria-hidden="true"
              className="shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center"
            >
              <LogIn className="h-5 w-5" />
            </div>
          </div>

          <div className="border-t border-border/60" />

          <div className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {error && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                    {error}
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground uppercase text-xs tracking-wider">Identification</FormLabel>
                      <FormControl>
                        <Input placeholder="commander@edc.local" {...field} className="bg-background/50 font-mono h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground uppercase text-xs tracking-wider">Passcode</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} className="bg-background/50 font-mono h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={login.isPending}>
                  {login.isPending ? "Authenticating..." : "Initialize Session"}
                </Button>
              </form>
            </Form>
          </div>

          {/* Confidential band */}
          <div className="border-t border-border/60 px-6 py-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-primary" />
              EDC · Confidential
            </span>
            <span>Internal Use Only</span>
          </div>
        </div>

        {/* Helper text below the card */}
        <p className="mt-5 text-xs text-muted-foreground text-center">
          Authorized commanders only · Sessions are audited.
        </p>
      </div>
    </div>
  );
}
