# Claude Desktop Setup

This guide shows how to connect `xhs-favorites` to Claude Desktop through MCP.

## 1. Install the package

```bash
npm install -g xhs-favorites
```

Confirm the MCP entrypoint is available:

```bash
which xhs-favorites-mcp
```

## 2. Edit Claude Desktop MCP config

Config file locations:

- macOS:
  `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows:
  `%APPDATA%\\Claude\\claude_desktop_config.json`

Example config:

```json
{
  "mcpServers": {
    "xhs-favorites": {
      "command": "xhs-favorites-mcp",
      "args": []
    }
  }
}
```

If Claude Desktop cannot find the binary, replace `"xhs-favorites-mcp"` with the absolute path returned by:

```bash
which xhs-favorites-mcp
```

## 3. Restart Claude Desktop

Quit and reopen Claude Desktop completely.

## 4. Initialize the XiaoHongShu session

Run this once in a normal terminal:

```bash
xhs-favorites login
```

Then verify:

```bash
xhs-favorites doctor --pretty
```

The tool stores its dedicated browser profile here:

```text
~/.mcp/xhs-favorites/profile
```
