# Contributing

Thanks for contributing to `xhs-favorites`.

## Development Setup

```bash
git clone git@github.com:ONEMULE/xhs-favorites.git
cd xhs-favorites
npm install
```

## Run Locally

```bash
npm test
node ./src/cli.js doctor --pretty
node ./src/cli.js login
```

## Before Opening a PR

- Keep changes focused and small.
- Run `npm test`.
- Update `README.md` if user-facing behavior changes.
- Update `CHANGELOG.md` for release-relevant changes.
- Do not commit local profile data, exports, or generated `.tgz` archives.

## Reporting Bugs

When possible, include:

- the command you ran
- whether you used headless mode
- whether the session was already logged in
- the exact JSON error payload
- whether XiaoHongShu showed a login page, captcha, or risk-control page

## Notes

- This project intentionally prefers `window.__INITIAL_STATE__` over brittle DOM scraping when possible.
- XiaoHongShu may change page structure or state shape without notice, so regressions should be expected occasionally.
