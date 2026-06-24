---
name: Briefing export & privacy boundary
description: How Executive Briefing Mode controls what is projected/printed/exported vs presenter-private
---

Executive Briefing Mode (`artifacts/edc/src/components/cockpit/briefing-mode.tsx`) has TWO independent export paths and any presenter-private content must be excluded from BOTH:

- **PNG export** uses `html-to-image` `toPng(contentRef.current)` — it captures ONLY the DOM subtree inside `contentRef`. Anything outside that ref is never in the PNG.
- **Print/PDF** uses `window.print()` — it captures the whole page EXCEPT elements with the `print:hidden` Tailwind class.

**Rule:** presenter-private content (e.g. `speaker_notes`) must live OUTSIDE `contentRef` AND carry `print:hidden`. Satisfying only one path leaks it via the other.

**Why:** the PRD requires speaker notes to never be projected or exported; they previously rendered inside `contentRef`, leaking into both PNG and print.

The public Bat-Signal share view (`/share/:token`) is independently safe: the server route (`artifacts/api-server/src/routes/shared.ts`) builds its response from an explicit field whitelist and never selects speaker notes.
