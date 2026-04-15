# Release Guide

This project now supports a cleaner release flow for maintainers.

## Manual release checklist

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Run:

```bash
npm test
npm run release:check
```

4. Commit the release preparation
5. Push `main`
6. Publish to npm
7. Tag the release
8. Create the GitHub release

## Publish to npm

```bash
npm publish
```

If npm requires 2FA:

```bash
npm publish --otp <6-digit-code>
```

## Tagging

```bash
git tag -a v0.1.1 -m "v0.1.1"
git push origin v0.1.1
```

## GitHub release

You can create the release from GitHub UI or via `gh`:

```bash
gh release create v0.1.1 --title v0.1.1 --notes-file RELEASE_NOTES.md
```

## Automated release workflow

The repository includes a release workflow under:

```text
.github/workflows/release.yml
```

To make it fully automatic, configure:

- `NPM_TOKEN` repository secret

Notes:

- The token must be valid for non-interactive CI publishing.
- If the same version already exists on npm, the workflow now skips the npm publish step instead of failing on rerun.

Then pushing a `v*` tag can be used to run a release pipeline.
