#!/usr/bin/env node

import { parseArgs } from "node:util";
import packageJson from "../package.json" with { type: "json" };
import { bootstrap } from "./bootstrap.js";
import { exportReviewBundle } from "./export.js";
import {
  doctor,
  getSavedNoteDetail,
  listBoardItems,
  listSavedBoards,
  listSavedNotes,
  login
} from "./service.js";
import { printError, printJson } from "./output.js";

function helpText() {
  return `xhs-favorites v${packageJson.version}

Commands:
  bootstrap [--client codex|claude|both|none] [--browser chromium] [--with-deps] [--skip-browser-install] [--pretty]
  login [--channel chrome]
  doctor [--headless] [--channel chrome] [--pretty]
  list-notes [--limit 20] [--scroll 25] [--headless] [--channel chrome] [--pretty]
  list-boards [--limit 20] [--headless] [--channel chrome] [--pretty]
  list-board-items (--url <board_url> | --board-id <id>) [--limit 20] [--scroll 25] [--headless] [--channel chrome] [--pretty]
  note-detail (--url <note_url> | --note-id <id> [--xsec-token <token>]) [--headless] [--channel chrome] [--pretty]
  export-review [--out-dir <path>] [--headless] [--channel chrome] [--notes-scroll 600] [--board-scroll 300] [--pretty]

Success is written as JSON to stdout.
Errors are written as JSON to stderr.`;
}

function parseCommon(args, extraOptions = {}) {
  return parseArgs({
    args,
    allowPositionals: false,
    options: {
      headless: { type: "boolean", default: false },
      channel: { type: "string" },
      pretty: { type: "boolean", default: false },
      ...extraOptions
    }
  });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(`${helpText()}\n`);
    return;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  try {
    let payload;
    let pretty = false;

    switch (command) {
      case "login": {
        const parsed = parseCommon(rest);
        pretty = parsed.values.pretty;
        payload = await login({
          channel: parsed.values.channel
        });
        break;
      }

      case "bootstrap": {
        const parsed = parseCommon(rest, {
          client: { type: "string" },
          browser: { type: "string" },
          "with-deps": { type: "boolean", default: false },
          "skip-browser-install": { type: "boolean", default: false }
        });
        pretty = parsed.values.pretty;
        payload = bootstrap({
          client: parsed.values.client,
          browser: parsed.values.browser,
          withDeps: parsed.values["with-deps"],
          skipBrowserInstall: parsed.values["skip-browser-install"]
        });
        break;
      }

      case "doctor": {
        const parsed = parseCommon(rest);
        pretty = parsed.values.pretty;
        payload = await doctor({
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "list-notes": {
        const parsed = parseCommon(rest, {
          limit: { type: "string" },
          scroll: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await listSavedNotes({
          limit: parsed.values.limit,
          scroll: parsed.values.scroll,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "list-boards": {
        const parsed = parseCommon(rest, {
          limit: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await listSavedBoards({
          limit: parsed.values.limit,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "list-board-items": {
        const parsed = parseCommon(rest, {
          url: { type: "string" },
          "board-id": { type: "string" },
          limit: { type: "string" },
          scroll: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await listBoardItems({
          url: parsed.values.url,
          boardId: parsed.values["board-id"],
          limit: parsed.values.limit,
          scroll: parsed.values.scroll,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "note-detail": {
        const parsed = parseCommon(rest, {
          url: { type: "string" },
          "note-id": { type: "string" },
          "xsec-token": { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await getSavedNoteDetail({
          url: parsed.values.url,
          noteId: parsed.values["note-id"],
          xsecToken: parsed.values["xsec-token"],
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "export-review": {
        const parsed = parseCommon(rest, {
          "out-dir": { type: "string" },
          "notes-scroll": { type: "string" },
          "board-scroll": { type: "string" },
          "notes-limit": { type: "string" },
          "board-limit": { type: "string" },
          "board-item-limit": { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await exportReviewBundle({
          outDir: parsed.values["out-dir"],
          headless: parsed.values.headless,
          channel: parsed.values.channel,
          notesScroll: parsed.values["notes-scroll"],
          boardItemsScroll: parsed.values["board-scroll"],
          notesLimit: parsed.values["notes-limit"],
          boardsLimit: parsed.values["board-limit"],
          boardItemsLimit: parsed.values["board-item-limit"],
          onProgress: (message) => {
            process.stderr.write(`${message}\n`);
          }
        });
        break;
      }

      default:
        throw new Error(`Unknown command: ${command}\n\n${helpText()}`);
    }

    printJson(payload, { pretty });
  } catch (error) {
    process.exitCode = printError(error, { pretty: true });
  }
}

await main();
