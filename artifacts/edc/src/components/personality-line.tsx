import { useState } from "react";
import { pickPersonalityMessage } from "@/lib/personality/rotation";
import { defaultStore } from "@/lib/storage";
import { useFocusMode } from "@/lib/presence/focus-mode-context";

// One rotating line of warm filler for a moment that otherwise shows
// nothing (PRD 4.19). Locks its pick once per mount — a fresh message per
// page load, not per re-render. Self-suppresses under Focus Mode so every
// call site (Task 9) needs no extra guard.
export function PersonalityLine({ className }: { className?: string }) {
  const { enabled: focusMode } = useFocusMode();
  const [message] = useState(() => pickPersonalityMessage(defaultStore, new Date()));

  if (focusMode) return null;

  return <p className={className ?? "text-sm text-muted-foreground italic"}>{message.text}</p>;
}
