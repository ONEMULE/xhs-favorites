# Troubleshooting

## `xhs-favorites-mcp` command not found

Your MCP client cannot see the npm global bin directory.

Fix:

```bash
which xhs-favorites-mcp
```

Then put that absolute path into the MCP client config instead of relying on `PATH`.

## `AUTH_REQUIRED`

The dedicated Playwright profile is not logged in or the session expired.

Fix:

```bash
xhs-favorites login
xhs-favorites doctor --pretty
```

## `RISK_CONTROLLED`

XiaoHongShu is showing a verification or anti-abuse page.

Typical fixes:

- switch to a safer network
- try visible browser mode instead of headless mode
- complete the verification in the dedicated browser profile
- avoid repeated deep scroll exports in a short time window

## `SELECTOR_CHANGED`

The expected page state is missing. XiaoHongShu likely changed the page shape or the current page did not hydrate correctly.

Try:

- rerun in visible browser mode
- refresh the dedicated session
- confirm the page is not showing login or verification UI
- open an issue with the JSON error payload

## Global npm install succeeded, but command still fails

Check npm's global bin path:

```bash
npm bin -g
```

Make sure that directory is in your shell `PATH`.

## SSH pushes hang but HTTPS/gh works

That usually means your machine has an SSH path problem to GitHub, not a repository permission problem.

In that case:

- test `ssh -T git@github.com`
- verify DNS resolution for `github.com`
- fall back to `gh` or an HTTPS token push path temporarily
