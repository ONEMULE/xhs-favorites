# xhs-favorites

Persistent-profile XiaoHongShu favorites tooling built on Playwright.

## What It Provides

- `xhs-favorites login`
  Opens a real browser through the official Playwright CLI and stores the login session in a dedicated profile directory.
- `xhs-favorites list-notes`
  Reads your saved notes from your own favorites page.
- `xhs-favorites list-boards`
  Reads your favorite boards.
- `xhs-favorites list-board-items`
  Reads notes inside a favorite board.
- `xhs-favorites note-detail`
  Reads a note detail page using the saved session.
- `xhs-favorites doctor`
  Reports whether the profile is authenticated, blocked by risk control, or missing login.
- `xhs-favorites-mcp`
  Exposes the same capabilities through MCP over stdio.

## Install

```bash
npm install
```

## Usage

```bash
xhs-favorites login
xhs-favorites doctor --pretty
xhs-favorites list-notes --limit 10 --pretty
xhs-favorites list-boards --pretty
xhs-favorites list-board-items --url https://www.xiaohongshu.com/board/<board_id> --pretty
xhs-favorites note-detail --url https://www.xiaohongshu.com/explore/<note_id> --pretty
```

The dedicated Playwright profile lives under:

```text
~/.mcp/xhs-favorites/profile
```

## MCP Wiring

Start the MCP server locally:

```bash
npm run start:mcp
```

Example Codex configuration snippet:

```toml
[mcp_servers.xhs_favorites]
command = "node"
args = ["/Users/luoxin/Projects/xhs-favorites/src/mcp.js"]
```
