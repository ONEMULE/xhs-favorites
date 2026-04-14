# Installation Guide

This guide focuses on terminal-first setup from a clean machine.

## macOS

### 1. Install Node.js

If you already use Homebrew:

```bash
brew install node
```

Check:

```bash
node -v
npm -v
```

### 2. Install the package

```bash
npm install -g xhs-favorites
```

### 3. Install Playwright browser and configure MCP

For Codex:

```bash
xhs-favorites bootstrap --client codex --pretty
```

For Claude Desktop:

```bash
xhs-favorites bootstrap --client claude --pretty
```

For both:

```bash
xhs-favorites bootstrap --client both --pretty
```

### 4. Login once

```bash
xhs-favorites login
xhs-favorites doctor --pretty
```

## Ubuntu / Debian

### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Install the package

```bash
sudo npm install -g xhs-favorites
```

### 3. Install Playwright browser and Linux dependencies

For Codex:

```bash
xhs-favorites bootstrap --client codex --with-deps --pretty
```

For Claude Desktop:

```bash
xhs-favorites bootstrap --client claude --with-deps --pretty
```

### 4. Login once

```bash
xhs-favorites login
xhs-favorites doctor --pretty
```

## Windows

### 1. Install Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

Then reopen PowerShell and verify:

```powershell
node -v
npm -v
```

### 2. Install the package

```powershell
npm install -g xhs-favorites
```

### 3. Install Playwright browser and configure MCP

For Codex:

```powershell
xhs-favorites bootstrap --client codex --pretty
```

For Claude Desktop:

```powershell
xhs-favorites bootstrap --client claude --pretty
```

### 4. Login once

```powershell
xhs-favorites login
xhs-favorites doctor --pretty
```

## Notes

- `bootstrap` installs the Playwright browser and writes MCP config for the selected client.
- `bootstrap` does not log you into XiaoHongShu; you still need `xhs-favorites login`.
- If your MCP client cannot find `xhs-favorites-mcp`, use `which xhs-favorites-mcp` or the platform equivalent and put the absolute path into the config.
