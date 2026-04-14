# Security Policy

## Supported Versions

Security fixes are currently applied to the latest published release and the `main` branch.

## Reporting a Vulnerability

If you believe you found a security issue, do not post sensitive details in a public issue.

Please include:

- a short summary of the issue
- affected command or MCP tool
- whether the problem involves credentials, local profile data, or unexpected remote access
- minimal reproduction steps

Until a private reporting channel is added, open a minimal issue without secrets and explicitly ask for a private follow-up path.

## Sensitive Data Guidance

This project may interact with:

- XiaoHongShu login sessions
- persistent Playwright profile data
- exported note metadata

Please do not include any of the following in public issues or pull requests:

- browser profile directories
- cookies
- auth headers
- private exports containing personal browsing data
- screenshots showing secrets or account identifiers you do not want public
