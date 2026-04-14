# Codex Setup

This guide shows how to expose `xhs-favorites` to Codex as an MCP server after installing the npm package.

## 1. Install the package

```bash
npm install -g xhs-favorites
```

Confirm the binaries exist:

```bash
xhs-favorites --help
which xhs-favorites-mcp
```

## 2. Update Codex config

Edit:

```text
~/.codex/config.toml
```

Add:

```toml
[mcp_servers.xhs_favorites]
command = "xhs-favorites-mcp"
args = []
```

If Codex cannot find the binary from `PATH`, use an absolute path instead:

```toml
[mcp_servers.xhs_favorites]
command = "/absolute/path/to/xhs-favorites-mcp"
args = []
```

You can find the absolute path with:

```bash
which xhs-favorites-mcp
```

## 3. Reload Codex

Restart Codex or fully reload the current Codex session.

## 4. First login

Before asking Codex to read favorites, initialize the dedicated browser profile:

```bash
xhs-favorites login
```

Then confirm the session:

```bash
xhs-favorites doctor --pretty
```

## 5. Expected MCP tools

After Codex picks up the MCP config, the following tools should be available:

- `login`
- `doctor`
- `list_saved_notes`
- `list_saved_boards`
- `list_board_items`
- `get_saved_note_detail`
