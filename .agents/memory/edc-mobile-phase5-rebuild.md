# Mobile PWA Phase 5 — the visible layer rebuilt

Full write-up: `docs/changes/2026-08-11-mobile-phase5-rebuild.md`.
Branch `feat/mobile-phase5-rebuild`, 15 commits. 76 test files / 1041 tests.

Four tabs (Command · Deals · Intelligence · Memory) for all seven desktop areas.
Portfolio and Autopsy stopped being "needs desktop" stubs. Deal detail went from
8 collapsible sections to a Brief plus 16 deep-linkable pushed panels.

## Traps that cost real time

**`AdminOnly` renders `null`, not a disabled child.** Wrapping a list ROW in it
deletes the row for read-only users — not just its control. Anything where the
state is the content must branch on `useCanWrite` and render a plain row.

**`getComputedStyle(el).backgroundColor` returns the INTERPOLATED value while a
transition is running.** `.m-shell` transitions its background, so reading it
during a theme switch gave `rgb(240, 241, 248)` two frames after the token had
already flipped to `231 28% 6%`. Anything syncing OS chrome (`theme-color`) must
read the custom property — custom properties are not transitioned.

**A URL codec drops unknown keys silently, so a stale link keeps "working".** The
manifest's Red alerts shortcut read `?filter=critical`; when Deals moved onto
`roster-url.ts` the key stopped being recognised and the shortcut began opening
the unfiltered pipeline under the same name. Nothing threw. `manifest.test.ts`
now decodes every shortcut through the codec the screen parses with.

**Building from Git-Bash mangles `BASE_PATH=/` into a Windows path** and bakes
`/Program Files/Git/` into `index.html`'s manifest and asset hrefs. Build from
PowerShell — and do NOT use `2>&1` there, which turns a successful native build
into exit 255 (CLAUDE.md documents this; I hit both in one session).

**Unlayered type rungs fight each other.** `cn("m-body", cond && "m-headline")`
puts two author rules on one element. `type-usage.test.ts` caught this twice.

## Design calls with reasons attached

- **Undo covers acknowledge and snooze, never `accept`** — accept clears the
  server-side stage guardrail and carries a mandatory rationale, so a silent
  six-second revert would leave a guardrail lifted with nothing on the record.
- **`networkMode: "always"` on every mobile write** — the default pauses offline
  mutations, which triggers `OfflineSaveNotice`'s "queued, will save
  automatically". There is no outbox; both SW rules test `method === "GET"`.
- **Terminal stages unreachable from the phone** — closing collects the loss
  archetype/reason/competitor that write the Deal Memory record.
- **A heatmap becomes a ranked list, a matrix becomes a ranked list, the Sankey
  stays off.** Ranked by volume, not rate: 100% off one deal is arithmetic.
- **The shadcn chat kit was NOT installed** — `bubble` pulls unified `radix-ui`
  (this app uses scoped `@radix-ui/react-*`), `message-scroller` pulls
  `@shadcn/react`. Two new runtime deps for ~60 lines of markup.

## Guard suites that fail closed (each verified by planting a violation)

`write-allowlist` (derives write ops from the generated client's HTTP methods,
bans `useMutation` everywhere), `nav/routes` (table ⟷ `mobile-app.tsx`
agreement, literal-before-param), `screens/deal/panels` (which files may import
a write hook), `manifest`, `theme-color`, `tokens`, `type-usage`, `deps`.

## What the deployed sweep found (2026-08-11)

Offline copy, the 409 branch and the animated back gesture all behaved as
designed. Four defects did not, and none was reachable from a unit test:

**A flex child with no `min-w-0` does not truncate — it BURSTS.** shadcn's
`ItemContent` sets no min-width, so it keeps `min-width: auto` and cannot shrink
below its min-content width; with a `nowrap` title that is the entire title.
Measured 1003px inside a 390px phone. `truncate` on the title is inert, because
text-overflow only ellipsises a constrained box. If `Item` can wrap, you get a
mangled row instead of overflow — same cause, different symptom.

**`theme-color` is resolved FIRST-match-in-tree-order, not last.** index.html's
media-scoped light/dark pair precedes any unscoped tag JS appends, and between
them they always match, so the unscoped tag can never win. Both syncs had been
inert since the pair was added — a desktop bug mobile inherited. Fix: drop the
scoped pair once JS runs (correct under either ordering rule).

**Two navigation paths captured scroll in different places.** `aroundNav`
recorded it in the after-commit callback, where the shared container has already
moved to the incoming screen, so every push stored 0 for the outgoing entry.
`back-gesture.ts` recorded before moving and was right. Back always landed at
the top.

**"Reveal it in place" must clear the floating chrome, not the container.**
Aligning a revealed block's bottom to the scroller's bottom edge puts it behind
the tab bar and capsule — on screen, still untappable. A hit test at the centre
of "Advance anyway" returned the Intelligence tab. Subtract the scroller's own
`padding-bottom`, which is what reserves that band.

**Verify the served bundle hash before trusting any measurement.** The service
worker re-registered and replayed the previous build; a check that reads the
script filename first caught it and would otherwise have produced a false
"the fix didn't work".

**CDP `networkConditions: Offline` does NOT set `navigator.onLine`.** The app
concluded it was online with a failing server and bounced to /login, which looks
exactly like an offline-resilience bug and is not one. Patch `navigator.onLine`
and dispatch the `offline` event as well. Also: `emulate` REPLACES the whole
emulation state, so passing only `networkConditions` silently drops the viewport
and the desktop shell renders instead.

**Still unverified:** reader 403 (needs a reader account), real iOS/Android
devices, and 375/430px + light mode + the other three time bands.
