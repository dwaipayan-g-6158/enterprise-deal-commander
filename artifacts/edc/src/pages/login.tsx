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

/**
 * The credential maps to `commanders.username`, matched case-insensitively —
 * an address works because usernames look like one, not because the server
 * checks a mail field. "Email" alone would be a promise the API doesn't keep.
 */
const CREDENTIAL_LABEL = "Email or username";

const loginSchema = z.object({
  email: z.string().min(1, `${CREDENTIAL_LABEL} is required`),
  password: z.string().min(1, "Password is required"),
});

/**
 * Sign-in — the first screen anyone sees, on a phone as much as a laptop.
 *
 * It kept its own dialect long after the rest of the app stopped speaking it:
 * monospace inputs, `IDENTIFICATION` and `PASSCODE` in tracked capitals,
 * "Initialize Session" on the button. A control should say exactly what
 * happens when it is used, and this one now does.
 *
 * The mechanical work matters as much as the words. `100dvh` rather than
 * `100vh` so iOS's collapsing toolbar doesn't push the card under the fold;
 * safe-area insets because the installed app declares a translucent status bar
 * and would otherwise draw the wordmark under the clock; 48px targets, the
 * floor the mobile shell holds everything else to.
 *
 * The lockup above the card stays as-is. A wordmark is allowed to be
 * uppercase — it's a logotype, not a label.
 */
export default function Login() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const login = useLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    setError("");
    try {
      await login.mutateAsync({ data });
      setLocation("/");
    } catch (err: any) {
      setError(err?.error?.message || "That didn't match an account. Check the spelling and try again.");
    }
  };

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background p-4"
      // Inline rather than a utility: the four insets differ and Tailwind has
      // no arbitrary value for a shorthand of four env() calls.
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[20%] left-1/2 h-[55%] w-[60%] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]" />
        <div className="absolute -right-[10%] top-[55%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* The lockup. Uppercase here is a logotype, not a UI label. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <EdcLogoMark size={72} animated={false} />
          <h2 className="mt-4 text-base font-bold uppercase leading-snug tracking-[0.15em] text-foreground sm:text-lg sm:tracking-[0.18em]">
            Enterprise Deal Commander
          </h2>
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Commander Console
          </p>
        </div>

        <div className="w-full overflow-hidden rounded-xl border border-border/60 bg-card/60 shadow-2xl backdrop-blur-xl">
          <div className="p-6">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace to continue.</p>
          </div>

          <div className="border-t border-border/60" />

          <div className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {error && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {error}
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{CREDENTIAL_LABEL}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="commander@edc.local"
                          autoComplete="username"
                          {...field}
                          className="h-12 bg-background/50"
                        />
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="current-password"
                          {...field}
                          className="h-12 bg-background/50"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="h-12 w-full text-sm font-semibold" disabled={login.isPending}>
                  {login.isPending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
          </div>
        </div>

        {/* One plain fact, once. The "EDC · CONFIDENTIAL / INTERNAL USE ONLY"
            band this replaces was 10px tracked capitals saying nothing a
            reader could act on. */}
        <p className="mt-5 text-center text-xs text-muted-foreground">Sessions are audited.</p>
      </div>
    </div>
  );
}
