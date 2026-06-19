# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- Tool use pills now show condensed, tool-specific labels: `bash: <cmd>`,
  `read: file.txt 10:50`, `write: file.txt`, `edit: file.txt`, `glob: <pattern>`,
  `grep: <pattern>`, etc. Expanded view shows command + result for bash/read/glob/grep,
  or the content for write, or the old/new diff for edit.
- Multiple Agent tool calls in one turn are grouped under a single
  "Agents started" pill; expanded view lists each agent type and result size.
- Skills show as non-expandable `Executing <name> skill` labels.
- Hooks show as non-expandable `Executing <name> hook` labels.
- Thinking blocks, system events, and non-hook attachment metadata are
  no longer shown.

### Added
- JSONL session viewer: upload a Claude CLI `.jsonl` file and render the
  conversation as a chat log (user right, assistant left)
- Collapsible pills for meta events: tool_use (with stitched tool results),
  thinking blocks, attachment hooks, and system events
- Full markdown rendering in assistant bubbles via vendored marked.js
- As-you-type search overlay with highlighted excerpts; clicking a result
  scrolls to the matching message; keyboard navigation (arrows, escape)
- IndexedDB persistence — session survives page refresh without re-uploading
- Progressive DOM rendering via IntersectionObserver for large sessions
- GitHub Actions workflow deploys the site to GitHub Pages on push to main
