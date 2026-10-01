# Nirmaan ⚡ (Lab Sync Engine)

> Zero-persistence, ephemeral real-time code and communication hub for computer labs,
> workshops, and competitive programming.

Up to 50 workstations join an isolated room by URL and exchange syntax-highlighted code
blocks and messages. **Nothing is persisted.** When the tabs close, the room is gone.

---

## Features

- **Strictly zero persistence.** No `localStorage`, no `sessionStorage`, no database rows,
  no disk writes. Messages live in volatile browser memory only.
- **100% client-side.** Single `index.html`. No build step, no backend server. Static hosting.
- **Workstation presence.** Live peer list via WebSocket presence, announced accessibly.
- **Code drops.** Auto-detected or explicit language selection across 14 languages, with
  pixel-aligned line numbering, one-click copy, and native-file download.
- **Editor conveniences.** Tab inserts two spaces, Shift+Tab dedents, `Ctrl`/`Cmd`+`Enter`
  sends, never losing focus.
- **URL hash routing.** `https://<you>.github.io/nirmaan/#lab-bench-1` joins that room.
- **Dual-mode networking.** Supabase Realtime across devices, with automatic in-browser
  Local Mesh fallback across tabs.
- **Reconnect resilience.** Exponential backoff with jitter, plus a visible
  "reconnected, N missed" notice after a dropout.

## Honest limits

Read these before deploying. They are properties of the design, not bugs.

1. **A dropped connection loses messages.** There is no server, so there is no replay. On
   reconnect the app tells you how many messages you missed, but it cannot deliver them.
   It does resend your own last 25 messages to rejoin the conversation.
2. **A reloading or late-joining workstation starts empty.** Nothing is stored, by design.
3. **Broadcasts are unsigned.** Any workstation in a room can craft a broadcast claiming to
   be any other workstation. The app enforces "you can only edit or delete your own
   messages" client-side, which stops accidents but is a convention, not a guarantee.
   Against a hostile peer you would need a server.
4. **Free-tier ceilings.** Documented Supabase limits are 200 concurrent connections,
   100 messages/sec, and 256KB per broadcast payload. The app caps payloads at 256KB.
   The 50-workstation target fits comfortably; a larger hall may want the Pro plan.
5. **Tailwind is loaded from its CDN**, which is the in-browser JIT build rather than a
   production stylesheet. It works, but adds a compile pass before first paint on low-spec
   machines. Pinning or self-hosting it is the obvious future optimization.
6. **CDN dependency.** Fonts, Tailwind, highlight.js, and the Supabase SDK load from CDNs.
   On a network that blocks them the app degrades to unstyled plain text but still
   delivers messages.

## Deployment

This repo is already live via GitHub Pages at
**`https://<owner>.github.io/nirmaan/`**.

To deploy your own copy:

1. Fork or clone this repository.
2. Nothing to build — `index.html` is the entire application.
3. Enable Pages: **Settings → Pages → Source: `main`, branch `/ (root)`**.
4. Open the URL and append a room, e.g. `#lab-01`.

### Supabase

The anon key is embedded at the top of the `<script>` block:

```javascript
const SUPABASE_URL = 'https://vtyzkduicanxopotfcws.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

The `anon` key is a public client credential by design: it only gates Realtime channel
access, and this app performs no writes, so there is nothing behind it to leak. To use your
own project, create one at [database.new](https://database.new) and replace both constants.
No server or environment variables are required.

## Lab usage

1. **Instructor** opens the site URL on the projector.
2. **Students** open that same URL, or scan it, to join the room.
3. Each workstation sets its node label (`PC-07`, `Student-A`) in the top bar.
4. Broadcast solutions or hints with `Ctrl`+`Enter`.
5. End of lab: close the tabs. Nothing remains.

## Tests

```bash
node --test test/run.mjs
```

Covers the security-critical paths: hostile message-id rejection, edit/delete ownership
enforcement, duplicate-delivery idempotency, language detection, and backoff bounds.

## Architecture

One `index.html` with separated units communicating through an event bus:

| Unit | Responsibility |
| --- | --- |
| `Core` | Pure logic: validation, language detection, filenames, backoff, room slugs |
| `Transport` | Connection lifecycle, Supabase Realtime, Local Mesh, reconnection |
| Store (in-render) | Message state, keyed by id, idempotent |
| Renderer | DOM construction. All peer text via `textContent` |
| Composer | Input, Tab/Shift+Tab, keyboard send |