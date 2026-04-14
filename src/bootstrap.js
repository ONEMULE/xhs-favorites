import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { ErrorCodes, XhsFavoritesError } from "./errors.js";
import { PROFILE_DIR, ensureRuntimeDirs } from "./constants.js";

const require = createRequire(import.meta.url);

const MCP_SERVER_NAME = "xhs_favorites";
const CLAUDE_SERVER_NAME = "xhs-favorites";
const CODEX_BLOCK = `[mcp_servers.${MCP_SERVER_NAME}]
command = "xhs-favorites-mcp"
args = []
`;

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendBlockIfMissing(filePath, header, block) {
  ensureParentDir(filePath);
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

  if (existing.includes(header)) {
    return {
      status: "already_configured",
      path: filePath
    };
  }

  const next = existing.trimEnd() ? `${existing.trimEnd()}\n\n${block}` : block;
  fs.writeFileSync(filePath, `${next.trimEnd()}\n`, "utf8");
  return {
    status: "written",
    path: filePath
  };
}

export function getCodexConfigPath() {
  return process.env.XHS_FAVORITES_CODEX_CONFIG || path.join(os.homedir(), ".codex", "config.toml");
}

export function getClaudeConfigPath() {
  if (process.env.XHS_FAVORITES_CLAUDE_CONFIG) {
    return process.env.XHS_FAVORITES_CLAUDE_CONFIG;
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new XhsFavoritesError(
        ErrorCodes.INVALID_INPUT,
        "APPDATA is not set, so the Claude Desktop config path cannot be resolved."
      );
    }
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdgConfigHome, "Claude", "claude_desktop_config.json");
}

export function writeCodexConfig(configPath = getCodexConfigPath()) {
  return appendBlockIfMissing(configPath, `[mcp_servers.${MCP_SERVER_NAME}]`, CODEX_BLOCK);
}

export function writeClaudeConfig(configPath = getClaudeConfigPath()) {
  ensureParentDir(configPath);

  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  let payload = {};

  if (existing.trim()) {
    try {
      payload = JSON.parse(existing);
    } catch (error) {
      throw new XhsFavoritesError(
        ErrorCodes.INVALID_INPUT,
        `Claude Desktop config is not valid JSON: ${configPath}`,
        { cause: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  payload.mcpServers = payload.mcpServers || {};
  const alreadyConfigured =
    payload.mcpServers[CLAUDE_SERVER_NAME]?.command === "xhs-favorites-mcp";

  payload.mcpServers[CLAUDE_SERVER_NAME] = {
    command: "xhs-favorites-mcp",
    args: []
  };

  fs.writeFileSync(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    status: alreadyConfigured ? "already_configured" : "written",
    path: configPath
  };
}

function resolvePlaywrightCliPath() {
  return require.resolve("playwright/cli");
}

export function installPlaywrightBrowser({
  browser = "chromium",
  withDeps = false
} = {}) {
  const cliPath = resolvePlaywrightCliPath();
  const args = [cliPath, "install"];
  if (withDeps) {
    args.push("--with-deps");
  }
  args.push(browser);

  const result = spawnSync(process.execPath, args, {
    stdio: "inherit"
  });

  if (result.error) {
    throw new XhsFavoritesError(ErrorCodes.UNKNOWN, result.error.message);
  }

  if (result.status !== 0) {
    throw new XhsFavoritesError(
      ErrorCodes.UNKNOWN,
      `Playwright browser installation failed with exit code ${result.status}.`
    );
  }

  return {
    browser,
    with_deps: withDeps
  };
}

export function bootstrap({
  client = "none",
  browser = "chromium",
  withDeps = false,
  skipBrowserInstall = false
} = {}) {
  ensureRuntimeDirs();

  const normalizedClient = String(client || "none").toLowerCase();
  if (!["none", "codex", "claude", "both"].includes(normalizedClient)) {
    throw new XhsFavoritesError(
      ErrorCodes.INVALID_INPUT,
      "client must be one of: none, codex, claude, both"
    );
  }

  const result = {
    ok: true,
    client: normalizedClient,
    profile_dir: PROFILE_DIR,
    browser_install: null,
    codex: null,
    claude: null,
    next_step: "Run `xhs-favorites login` to initialize the dedicated XiaoHongShu browser profile."
  };

  if (!skipBrowserInstall) {
    result.browser_install = installPlaywrightBrowser({ browser, withDeps });
  }

  if (normalizedClient === "codex" || normalizedClient === "both") {
    result.codex = writeCodexConfig();
  }

  if (normalizedClient === "claude" || normalizedClient === "both") {
    result.claude = writeClaudeConfig();
  }

  return result;
}
