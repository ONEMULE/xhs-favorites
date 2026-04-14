# xhs-favorites

Persistent-profile XiaoHongShu favorites tooling built on Playwright.

`xhs-favorites` is a small toolchain for reading your own XiaoHongShu saved notes and favorite boards with a dedicated Playwright browser profile. It has two entrypoints:

- `xhs-favorites`
  CLI for login, diagnostics, reading favorites, and exporting a review bundle.
- `xhs-favorites-mcp`
  MCP server exposing the same capabilities over stdio for Codex or other MCP clients.

## What It Provides

- Dedicated persistent browser profile
  The tool keeps a separate Playwright user data directory and does not depend on ad-hoc cookie files as the primary auth path.
- Saved notes listing
  Reads your main favorites feed.
- Favorite boards listing
  Reads your saved boards / collections.
- Board item listing
  Reads notes inside a specific board.
- Note detail reading
  Opens a specific note URL and extracts structured content.
- Diagnostics
  Detects `authenticated`, `auth_required`, and `risk_controlled` states.
- Review bundle export
  Produces CSV + JSON + HTML for manual review and follow-up detail selection.

## Requirements

- Node.js `>=20`
- npm
- A machine that can open a real browser for the first login
- Network access to XiaoHongShu

## Install

### Local clone

```bash
git clone git@github.com:ONEMULE/xhs-favorites.git
cd xhs-favorites
npm install
```

### Global install from a public GitHub repo

If the repository is public, users can install it directly:

```bash
npm install -g github:ONEMULE/xhs-favorites
```

If the repository stays private, users need direct repository access or should clone it locally and run it from source.

## Session Model

The dedicated Playwright profile lives under:

```text
~/.mcp/xhs-favorites/profile
```

This matters because:

- first login is manual
- later commands reuse the same browser profile
- the tool can survive process restarts without requiring a fresh cookie import every time

## Quick Start

```bash
npm install
node ./src/cli.js login
node ./src/cli.js doctor --pretty
node ./src/cli.js list-notes --limit 10 --pretty
```

The `login` command opens a real browser using the official Playwright CLI. After you finish logging into XiaoHongShu and close that browser window, the profile is persisted and later commands can reuse it.

## CLI Commands

### `login`

Open a real browser and persist the session into the dedicated Playwright profile.

```bash
node ./src/cli.js login
node ./src/cli.js login --channel chrome
```

### `doctor`

Check whether the profile is logged in, blocked by risk control, or missing authentication.

```bash
node ./src/cli.js doctor --pretty
node ./src/cli.js doctor --headless --pretty
```

Typical result:

```json
{
  "ok": true,
  "profile_dir_exists": true,
  "login_state": "authenticated",
  "page_url": "https://www.xiaohongshu.com/explore",
  "page_title": "小红书 - 你的生活兴趣社区",
  "profile_id": "6707b784000000001d0236fa"
}
```

### `list-notes`

Read the main favorites feed.

```bash
node ./src/cli.js list-notes --limit 10 --pretty
node ./src/cli.js list-notes --headless --limit 50 --scroll 80 --pretty
```

### `list-boards`

Read favorite boards.

```bash
node ./src/cli.js list-boards --pretty
```

### `list-board-items`

Read notes inside a specific board.

```bash
node ./src/cli.js list-board-items --board-id 683f2dd7000000002300522c --limit 20 --pretty
node ./src/cli.js list-board-items --url "https://www.xiaohongshu.com/board/<board_id>" --pretty
```

### `note-detail`

Read one note in detail using an authenticated session.

```bash
node ./src/cli.js note-detail --url "https://www.xiaohongshu.com/discovery/item/<note_id>?xsec_token=..." --pretty
node ./src/cli.js note-detail --note-id <note_id> --xsec-token <token> --pretty
```

### `export-review`

Export a review bundle for large-scale manual triage.

```bash
node ./src/cli.js export-review --headless --pretty
```

This command writes:

- `favorites_review.csv`
- `favorites_review.json`
- `favorites_review.html`
- `favorites_review_summary.json`

The HTML file provides:

- searchable review table
- real checkboxes
- local selection persistence in the browser
- export of an updated CSV with the current selections

## Output Files

By default, export bundles are written under:

```text
~/.mcp/xhs-favorites/exports/<timestamp>/
```

Typical files:

- `favorites_review.csv`
  Flat review sheet with note metadata and selection columns.
- `favorites_review.html`
  Interactive review page for manually selecting notes worth deeper extraction.
- `favorites_review.json`
  Full structured export.
- `favorites_review_summary.json`
  Short metadata summary.

## MCP Wiring

### Start locally

```bash
npm run start:mcp
```

### Codex configuration

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.xhs_favorites]
command = "node"
args = ["/Users/luoxin/Projects/xhs-favorites/src/mcp.js"]
```

Then restart or reload your Codex client session if needed.

### Exposed MCP tools

- `login`
- `doctor`
- `list_saved_notes`
- `list_saved_boards`
- `list_board_items`
- `get_saved_note_detail`

## Troubleshooting

### `AUTH_REQUIRED`

This means the dedicated profile is not logged in or the session expired.

Fix:

```bash
node ./src/cli.js login
```

### `RISK_CONTROLLED`

XiaoHongShu is showing a risk-control or verification page.

Typical fixes:

- switch to a safer network
- use the visible browser flow instead of headless
- complete the requested verification in the dedicated profile
- avoid repeated full-history scraping in a short period

### `SELECTOR_CHANGED`

The front-end state shape or DOM path likely changed.

This tool intentionally prefers `window.__INITIAL_STATE__` where possible, but XiaoHongShu can still change the page structure. Re-check:

- favorites list state
- board list state
- board feed state
- note detail state

### SSH push hangs but HTTPS works

If `git push` over SSH times out, but `gh` still works, the problem is usually the machine's SSH path to GitHub rather than the repository itself.

## How To Share This With Other Users

The simplest rollout path is:

1. Make the GitHub repository public.
2. Keep the README focused on source install plus MCP wiring.
3. Let users either clone the repo or install directly from GitHub:

```bash
npm install -g github:ONEMULE/xhs-favorites
```

If you want a cleaner user experience after that, the next steps are:

### Option A: GitHub-only distribution

Best if the audience is technical.

- Keep the repo public.
- Add a GitHub Release when you cut a stable version.
- Put a short install block at the top of the README.

### Option B: npm distribution

Best if you want one-line installs such as `npm install -g xhs-favorites`.

Before publishing:

- choose and add a real license
- remove `"private": true` from `package.json`
- verify package contents with `npm pack`
- publish with `npm publish`

### Option C: bundled desktop-friendly release

Best if the audience is less technical.

- ship a small install script
- or package a standalone runner for macOS
- keep MCP as the advanced path and CLI as the default path

Right now, the project is already in a good state for **GitHub repo distribution**. npm distribution is the logical next step once you decide on a license and want a stable public package name.

## Development

```bash
npm test
```
