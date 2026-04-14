import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeClaudeConfig, writeCodexConfig } from "../src/bootstrap.js";

function withTempDir(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xhs-favorites-test-"));
  try {
    return fn(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("writeCodexConfig writes once and stays idempotent", () =>
  withTempDir((tempDir) => {
    const configPath = path.join(tempDir, "config.toml");

    const first = writeCodexConfig(configPath);
    const second = writeCodexConfig(configPath);
    const content = fs.readFileSync(configPath, "utf8");

    assert.equal(first.status, "written");
    assert.equal(second.status, "already_configured");
    assert.equal((content.match(/\[mcp_servers\.xhs_favorites\]/g) || []).length, 1);
    assert.match(content, /command = "xhs-favorites-mcp"/);
  }));

test("writeClaudeConfig merges mcp server config", () =>
  withTempDir((tempDir) => {
    const configPath = path.join(tempDir, "claude_desktop_config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            existing: {
              command: "existing",
              args: []
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = writeClaudeConfig(configPath);
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));

    assert.equal(result.status, "written");
    assert.deepEqual(parsed.mcpServers["xhs-favorites"], {
      command: "xhs-favorites-mcp",
      args: []
    });
    assert.deepEqual(parsed.mcpServers.existing, {
      command: "existing",
      args: []
    });
  }));
