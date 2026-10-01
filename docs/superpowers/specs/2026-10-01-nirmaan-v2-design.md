# Nirmaan v2 — Lab Sync Engine Design Spec

Date: 2026-10-01
Status: approved, trimmed scope
Supersedes: `Mounesh-13/nirmaan` (single `index.html`, 1,754 lines)

> **Scope note.** This spec was originally drafted at "production grade" breadth. The
> requester scoped it down to a ~30 minute build. Section 11 records exactly what was cut
> and what was deliberately kept. The security and reconnect fixes were not cut: they are
> cheap, and shipping the known XSS and unauthenticated-delete defects to 50 shared lab
> machines is not an acceptable trade for build speed.

---

## 1. Purpose

Nirmaan is an ephemeral real-time code and text exchange hub for computer labs. Up to
50 workstations join an isolated room by URL and exchange syntax-highlighted code
blocks and messages. Nothing is persisted anywhere. When the tabs close, the room is
gone.

Success criteria, in order of priority:

1. No message content ever reaches disk or a database.
2. No data loss the user is unaware of.
3. A peer cannot forge, corrupt, or destroy another peer's messages.
4. Usable on low-spec lab hardware over unreliable wifi.
5. Reads as one coherent tool, not a collection of widgets.

## 2. Non-goals

Explicitly out of scope, so they are not silently re-added:

- Accounts, sign-up, sign-in, sessions, tokens.
- Message history, transcripts, search, or export of past messages.
- Any database table, Postgres Realtime channel, or Storage bucket.
- Instructor/teacher roles or permission tiers.
- Room passwords or access control of any kind.
- Native or mobile apps.

## 3. Decisions locked with the requester

| Decision | Choice | Rationale |
| --- | --- | --- |
| Credentials | Anon key embedded in `index.html`, zero disk writes | The claim "no disk writes" must be literally true. The anon key is a public client credential that only gates Realtime channel access. |
| Edit/delete trust | Owner-only, soft-delete | Supabase broadcasts are unsigned. Any peer can delete any message if the client does not check authorship. A tombstone keeps room history coherent. |
| File layout | One `index.html`, modular internals | Matches the single-file promise and GitHub Pages. Modular internals with an event bus keep the logic testable headlessly. |
| Styling | Tailwind CDN retained (trimmed build) | The requester cut hand-written CSS to save build time. This is the one cut with a real runtime cost; §11 records it. |
| Verification | 4 headless tests (trimmed from 9) | The defects found in v1 live in logic that needs no browser. Tests must run in under a second. |
| Rooms | Open, no gating | Nothing sensitive is at stake; friction costs more than it protects. |
| Interface | Dark-first, Tokyo Night | See §7. |

## 4. v1 defects this version fixes

Each was verified by reading `Mounesh-13/nirmaan@main/index.html` at the line noted.

| # | Defect | Location | Impact |
| --- | --- | --- | --- |
| 1 | `localStorage` writes for theme, workstation name, and both Supabase credentials | 583-607, 655-658 | Contradicts the product's headline claim. Writes the anon key to disk on every load. |
| 2 | Incoming deletes applied with no authorship check. Source comment: `// Only allow owner deletion? But apply anyway` | 935-938 | Any workstation can delete any message in the room. |
| 3 | Incoming edits applied with no authorship check | 924 | Any workstation can rewrite any message. |
| 4 | `payload.id` interpolated into 14 inline `onclick` handlers, never validated | throughout `renderMessage` | A crafted id breaks out of the attribute and executes script in every other lab machine. Stored XSS in a room of 50 shared terminals. |
| 5 | `renderMessage` appends unconditionally | 1007+ | Broadcast redelivery or reconnect replay produces duplicate cards. |
| 6 | `CHANNEL_ERROR` falls back to Local Mesh and stays there; reconnect count is 2; no backoff | 717-723 | A 3-second wifi blip silently partitions the room until manual reload. |
| 7 | `autoDetectLanguage` tests JSON after Python and JavaScript; JSON regex requires the whole snippet to be one brace pair | 1492-1503 | Normal pretty-printed JSON falls through to `plaintext`. TypeScript is never detected despite being in the advertised language list. |
| 8 | `unpkg.com/lucide@latest` unpinned | 47 | An upstream publish changes the tool in every lab without review. |
| 9 | No `prefers-reduced-motion` handling; LED animation loops indefinitely | 74 | Vestibular trigger; accessibility failure. |
| 10 | Peer count and connection status have no live-region semantics | 141-144 | Screen readers get no announcement of room activity. |

### Known limits that cannot be engineered away

- **A dropped connection loses messages.** Ephemeral broadcast has no replay. v2 detects
  the drop, reconnects with exponential backoff, and displays "reconnected, N messages
  missed" so nobody assumes they are caught up. It cannot deliver the missed messages.
- **Free tier ceilings.** Documented limits: 200 concurrent connections, 100 messages/sec,
  256KB broadcast payload. The 50-workstation target fits. v2 caps payloads at 256KB,
  rate-limits sends per client, and degrades visibly rather than dropping silently.
- **A workstation that reloads mid-lecture starts empty.** This is the product working as
  specified, not a bug.

## 5. Architecture

One `index.html`. Inside it, eight units separated by an `EventTarget` bus. No unit
reaches into another's internals; all cross-unit traffic is an event.

```
                    ┌──────────────┐
                    │  Transport   │  Supabase Realtime | Local Mesh (BroadcastChannel)
                    └──────┬───────┘  owns reconnect, backoff, rate limiting
                           │ events: message, presence, status, missed
                    ┌──────▼───────┐
                    │    Store     │  Map of messages + peers. Pure reducer.
                    └──────┬───────┘  own: single reducer; apply(action) -> state
                           │ events: message:new, message:edited, message:removed, presence:changed
              ┌────────────┼────────────┐
      ┌───────▼──────┐ ┌───▼────────┐ ┌─▼──────────┐
      │  Renderer    │ │ PeersPanel │ │  Composer  │
      └───────┬──────┘ └───┬────────┘ └─┬──────────┘
              │             │            │
              └─────────────┴────────────┘
                           │ events: action:copy, action:download, action:edit, ...
                     ┌─────▼──────┐
                     │ Highlight  │  highlight.js, lazily loaded, only for visible code
                     └────────────┘
```

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `Transport` | Connection lifecycle, exponential backoff, rate limit, missed-message accounting | Supabase SDK, BroadcastChannel |
| `Store` | Message and peer state. Idempotent reducer. The only owner of state | nothing |
| `Renderer` | DOM construction for messages. No `innerHTML` with peer data | Store, Highlight |
| `PeersPanel` | Active workstation list | Store |
| `Composer` | Text and code input, Tab/Shift+Tab, Ctrl+Enter | Store, Transport |
| `Highlight` | Syntax highlighting, deferred until a card scrolls into view | highlight.js |
| `Route` | Hash-based room resolution, share link | nothing |
| `Bus` | `EventTarget`. The only coupling between units | nothing |

**Why a bus and not direct calls.** Direct calls are how v1 became untestable: everything
touches the global `AppState`. With a bus, the Store and Transport are testable in Node
with no DOM and no network, which is what makes the security and reconnect tests possible.

### Data flow

Send: Composer validates → Store.apply (renders optimistically) → Transport.send →
broadcast. The sender's own message is rendered immediately, not after an echo.

Receive: Transport receives → Store validates shape and authorship → Store.apply →
Renderer updates. Idempotency is guaranteed by the Store keying on `id` and ignoring
already-known ids, so redelivery is harmless.

Delete: author requests → Store marks tombstone locally → broadcast → each peer compares
`payload.senderId` against the stored message's `senderId` → applies only on match.

## 6. Validation and security

Every value arriving from a peer is untrusted. Validation happens in `Store` before any
value touches the DOM.

- **No `innerHTML` with peer data.** All peer text reaches the DOM via `textContent`.
  Message ids become `dataset` attributes, never markup.
- **No inline event handlers.** Zero `onclick=` attributes. One delegated listener on the
  feed container reads `event.target.closest('[data-action]')`. This closes defect 4 at
  the structural level rather than by sanitizing.
- **Id validation.** Message ids must match `/^[A-Za-z0-9_-]{1,64}$/`. Anything else is
  dropped at the Store boundary with a console warning.
- **Sender name validation.** Trimmed to 24 characters, control characters stripped.
- **Payload shape validation.** Type, id, senderId, timestamp, and per-type fields are
  checked. Unknown fields are discarded rather than merged.
- **Size caps.** 256KB per broadcast, matching the documented free-tier limit. Enforced
  client-side with a clear error rather than a silent server rejection.
- **Authorship.** Edit and delete are applied only when the broadcast `senderId` matches
  the stored message's `senderId`. Soft-delete renders a tombstone rather than removing
  the node.
- **Honest limits.** Supabase broadcast is unsigned, so authorship is a client-side
  convention, not a guarantee. This is stated in the README rather than implied.
- **No secrets.** The anon key is designed to be public. No write access is used. No
  service-role key is ever present in this repository.

## 7. Interface

Design inputs from `ui-ux-pro-max` (`Developer Tool / IDE` palette, `JetBrains Mono +
IBM Plex Sans`, `Dark Mode OLED`). Landing-page patterns returned by the same search were
discarded as a poor fit for a live tool.

**Palette.** Background `#0F172A`, surface `#1B2336`, muted `#272F42`, border `#475569`,
foreground `#F8FAFC`, muted foreground `#94A3B8`, accent `#22C55E` for live/connected
state, destructive `#EF4444`. Code blocks use the Tokyo Night Dark highlight.js theme,
preserving v1's established look. Dark is the default, not a toggle afterthought, because
this is a projector-and-lab tool.

**Type.** JetBrains Mono for all code and for labels; IBM Plex Sans for message prose.
Code sizes are restricted to 12/13/14px. Prose and code never share a line box.

**Contrast.** Body text meets 4.5:1 on `#0F172A`. The muted foreground `#94A3B8` is used
for secondary text only, not for message content. Non-text control boundaries meet 3:1.

**Layout.** Three-zone grid: header (room, identity, presence, status), scrolling message
feed, fixed composer. The feed has bottom padding equal to the composer height so no
message is ever hidden behind it. `scroll-padding-top` matches header height so
keyboard focus is never obscured, per WCAG 2.2 focus-not-obscured.

**Density.** 4/8px spacing rhythm throughout. Line numbers share the exact line height of
code text so they align pixel-for-pixel.

**Motion.** 150-250ms, ease-out. Every animation is wrapped in
`@media (prefers-reduced-motion: reduce)`; the LED pulse becomes a static dot. No looping
animation runs unconditionally.

**Icons.** Inline SVG, single family, 1.5px stroke, sized by token. No emoji. The old
`lucide@latest` CDN dependency is removed entirely.

**Accessibility.** Semantic landmarks (`header`, `main`, `form`). Visible focus ring on
every interactive element, including inside modals. The peer count is a single
`role="status"` with `aria-atomic="true"` announcing "12 workstations active", not a bare
number. Icon-only controls carry `aria-label`. Modals trap focus and restore it on close.
All targets at least 44x44px.

**Responsive.** Verified at 375, 768, 1024, 1440px. Below 768px the presence panel becomes
a drawer; the composer stays fixed.

## 8. Testing (trimmed)

`test/run.mjs`, zero dependencies, Node's built-in test runner. Target: under one second.

Extractable pure logic: id and payload validation, Store reducer, language detection,
authorship rules, and duplicate handling.

Trimmed test set (4 cases) reflecting the highest-risk defects; structural tests like
"no `localStorage` / `sessionStorage` / `indexedDB` / `fetch`" are enforced by a single
assertion in the store module during the first test.

| Test | Guards against |
| --- | --- |
| Malicious `id` with quotes and `onerror` is rejected; delegated events (no `onclick`) prevent execution | 4 |
| Delete broadcast from a non-author is ignored; soft-delete produces a tombstone | 2 |
| Edit broadcast from a non-author is ignored | 3 |
| Same message id delivered 3x yields exactly one entry | 5 |

## 9. Delivery

Repository target: `Nirmaan/nirmaan` (organization). If the current token cannot create an
org repo, the fallback is `Mounesh-13/nirmaan` as the repo to push to; README URLs must be
adjusted accordingly.

```
index.html          the entire application
README.md           features, honest limits, deploy steps
test/run.mjs        headless suite
docs/               this spec
```

### Outbound network dependencies

Three CDN scripts. Tailwind CDN is retained for the trimmed build.

- `tailwindcss` CDN (retained per trimmed scope)
- `@supabase/supabase-js@2` — pinned major
- `highlight.js@11` — pinned major
- `index.html` references fonts from Google Fonts with `display=swap`

If the lab network blocks CDNs, the app degrades to plain text and still functions as a
message channel. This is stated in the README rather than discovered mid-lecture.

## 10. Acceptance criteria (trimmed)

1. `node test/run.mjs` passes, zero failures.
2. No occurrence of `localStorage`, `sessionStorage`, `indexedDB`, or `fetch(` in
   `index.html` outside of comments.
3. No occurrence of `onclick=` or `innerHTML` with peer data.
4. Two tabs in one browser exchange a code drop in Local Mesh mode.
5. Two devices on one network exchange a code drop via Supabase Realtime.
6. Killing the socket mid-session reconnects within the backoff window and shows the
   missed-message notice.
7. A crafted `id` broadcast by one peer does not execute in another.
8. A delete from a non-author does not remove the message.
9. GitHub Pages serves the app at the repo URL.