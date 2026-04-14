# FAQ

## Does this use Docker?

No. The current tool runs directly on the local machine with Node.js and Playwright. It uses a dedicated persistent browser profile under:

```text
~/.mcp/xhs-favorites/profile
```

## Do I need to keep a cookie file?

No. The primary path is the dedicated persistent Playwright profile, not a manually managed cookie file.

## Why does `login` open a real browser?

Because XiaoHongShu login and risk-control flows are far more stable when handled through a real interactive browser session.

## Why does `doctor` say `AUTH_REQUIRED`?

The dedicated Playwright profile is either not logged in yet or the session expired.

Run:

```bash
xhs-favorites login
xhs-favorites doctor --pretty
```

## Why do I get `RISK_CONTROLLED`?

XiaoHongShu is showing an anti-abuse or verification page. Common mitigations:

- retry with a safer network
- use visible browser mode
- complete the verification in the dedicated profile
- avoid repeatedly scraping full history in a short time

## Can I use this in Codex?

Yes. Install the package and add an MCP entry using `xhs-favorites-mcp`.

See:

- [Codex guide](./codex.md)

## Can I use this in Claude Desktop?

Yes. Install the package and add an MCP entry using `xhs-favorites-mcp`.

See:

- [Claude Desktop guide](./claude-desktop.md)

## Does this expose my saved notes publicly?

No. The tool reads your own authenticated session locally. Public exposure only happens if you choose to publish exported files or screenshots yourself.

## Why can I install from npm but my MCP client cannot find `xhs-favorites-mcp`?

Your MCP client may not inherit the same shell `PATH`.

Find the absolute path:

```bash
which xhs-favorites-mcp
```

Then put that absolute path in the MCP config.

## How do releases work now?

`v0.1.1` and later are intended to be maintained through GitHub tags, npm publishing, and GitHub releases. See:

- [Release guide](./releasing.md)
