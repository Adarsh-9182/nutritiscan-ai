# Reference investigation — 3 November 2026

The user requested inspiration from Claude Code/Codex/Cursor and reverse engineering.
The OpenAI Docs and Reverse Engineer Anything skills were applied. No proprietary
source was copied, no authentication traffic intercepted and no credentials read.

## Observed

- Codex CLI 0.166.0 and Claude Code 2.1.311 were installed. No Codex, Claude or Cursor
  desktop bundle was found at the checked `/Applications` or `~/Applications` locations.
- Read-only REA analysis selected `package.json` and `bin/codex.js` from the installed
  Codex CLI package. Its launcher chooses a platform-native executable and forwards
  arguments, streams and lifecycle signals. Static inspection did not establish a
  desktop renderer, preload bridge, PTY implementation or the native runtime's internals.
- The generated version-matched app-server schemas established initialize, account,
  model, thread, turn, dynamic callback and approval contracts. A separate prototype
  exercised managed auth and actual model turns; runtime verification is distinct
  from the limited static REA evidence.
- The process-only empty MCP override retained inherited servers in the installed
  version. Explicit complete disabled entries were required. No shared configuration
  was changed. Native write/permission requests remain declined in the custom chat.

REA parent Evidence:
`ev_619b02d8d412344b7bfbe88a57ff09d975dd32a1d56a569cf372aa756bfd06f0`.
Launcher item:
`ev_72617c29f9b27304892833f0fedd596f28a0d0a08881e1ae406d2067424c29c6`.
The analysis was partial: two selected files, five unselected and 189 semantic
unknowns. The evidence bundle was retained separately under
`/private/tmp/nutritiscan-desktop-reference/`; it is not bundled into the product.

## Original design decisions

The biology workspace, Electron isolation/preload boundary, project store, research
tool handlers, dataset parser, memory UI and terminal broker are NutritiScan
implementation choices. They are not claimed to reconstruct a proprietary app.
The harness integration follows [OpenAI's app-server protocol](https://learn.chatgpt.com/docs/app-server).
Claude Code runs unchanged under its [documented integration conditions](https://code.claude.com/docs/en/legal-and-compliance).
