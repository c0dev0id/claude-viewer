# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
