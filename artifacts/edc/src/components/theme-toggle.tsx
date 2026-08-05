import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

export function ThemeToggle() {
  // resolvedTheme, not theme: with system following enabled (theme-provider),
  // `theme` reads "system" until the user picks a side, so comparing it to
  // "dark" made the first click a no-op for anyone on a dark desktop.
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start text-muted-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="mr-2 h-4 w-4" />
      ) : (
        <Moon className="mr-2 h-4 w-4" />
      )}
      {isDark ? "Light Mode" : "Dark Mode"}
    </Button>
  );
}
