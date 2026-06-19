# Development Journal

## Software Stack

- **Runtime:** Browser only — no server, no build step
- **JS:** Vanilla ES modules (`type="module"`), no bundler
- **Markdown:** `marked.js` v15 vendored at `vendor/marked.min.js`
- **Persistence:** IndexedDB (store `"sessions"`, key `"current"`)
- **Deploy:** GitHub Actions → GitHub Pages (`actions/deploy-pages@v4`)

## Key Decisions

### Vendored marked.js instead of CDN
Keeps the site self-contained and working offline. The file is committed to
the repo so no external requests are made at runtime.

### Progressive rendering via IntersectionObserver
Large session files (hundreds of turns) would freeze the browser if rendered
all at once. Turns are rendered in batches of 100; a sentinel element at the
bottom of the container triggers the next batch when scrolled into view.
`scrollToTurn` force-renders up to the target index before scrolling so search
navigation works even for un-rendered turns.

### Tool_result stitching in parser
Tool results arrive in `type:"user"` events keyed by `tool_use_id`, but the
originating `tool_use` block is inside the preceding `type:"assistant"` event.
The parser collects all tool results into a flat map during the first pass and
stitches `toolResultText` onto the matching `MetaItem` in a second pass.

### AbortController for search listener cleanup
`initSearchUI` is called on every file load. Using an `AbortController`
stored on the input element (`inputEl._searchAbort`) cancels all previous
event listeners before re-attaching, preventing listener stacking.

### IndexedDB error isolation
The `dbReady` promise catches open failures (e.g., private browsing in
Firefox/Safari) and resolves to `null`. All db functions no-op on `null` so
the app degrades gracefully without crashing.

## Core Features

- Upload `.jsonl` → chat log with user and assistant bubbles
- Collapsible pills for: tool_use (+ result), thinking, attachments, system events
- Full markdown rendering in assistant bubbles (code blocks, tables, lists)
- Search overlay with highlighted excerpts, keyboard navigation
- IndexedDB session cache (persists across refresh)
- GitHub Pages deploy via GitHub Actions
