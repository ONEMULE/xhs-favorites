import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_NAME = "xhs-favorites";
export const APP_HOME = path.join(os.homedir(), ".mcp", APP_NAME);
export const PROFILE_DIR = path.join(APP_HOME, "profile");
export const DIAGNOSTICS_DIR = path.join(APP_HOME, "diagnostics");

export const XHS_EXPLORE_URL = "https://www.xiaohongshu.com/explore";
export const XHS_HOST = "https://www.xiaohongshu.com";
export const DEFAULT_LIMIT = 20;
export const DEFAULT_SCROLL_ITERATIONS = 25;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_NETWORK_IDLE_TIMEOUT_MS = 15_000;
export const DEFAULT_CHANNEL = process.env.XHS_BROWSER_CHANNEL || "";
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function ensureRuntimeDirs() {
  fs.mkdirSync(APP_HOME, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
}
