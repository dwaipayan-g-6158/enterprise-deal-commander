# Mobile PWA Phase 5 — the visible layer rebuilt

Full write-up: `docs/changes/2026-08-11-mobile-phase5-rebuild.md`.
Branch `feat/mobile-phase5-rebuild`, 13 commits. 74 test files / 1026 tests.

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

**Not yet verified:** everything behind auth. Local sign-in is impossible
(`/__catalyst/sdk/init.js` is gateway-only), so the offline-write copy, reader
403, 409 override and back-gesture checks all need the deployed build.
