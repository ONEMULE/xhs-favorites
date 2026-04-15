#!/usr/bin/env node

import { parseArgs } from "node:util";
import packageJson from "../package.json" with { type: "json" };
import { bootstrap } from "./bootstrap.js";
import { exportReviewBundle } from "./export.js";
import {
  doctor,
  doctorFull,
  favoriteNote,
  getSavedNoteDetail,
  getNoteComments,
  getNoteDetail,
  getCreatorContentMetrics,
  getCreatorDashboard,
  getCreatorFanMetrics,
  likeNote,
  listHomeFeed,
  listBoardItems,
  listSavedBoards,
  listSavedNotes,
  listUserNotes,
  login,
  postComment,
  publishNote,
  publishVideo,
  replyComment,
  searchNotes
} from "./service.js";
import { printError, printJson } from "./output.js";

function helpText() {
  return `xhs-favorites v${packageJson.version}

Commands:
  bootstrap [--client codex|claude|both|none] [--browser chromium] [--with-deps] [--skip-browser-install] [--pretty]
  login [--channel chrome] [--target main|creator]
  doctor [--headless] [--channel chrome] [--pretty]
  doctor-full [--headless] [--channel chrome] [--pretty]
  home-feed [--limit 20] [--scroll 25] [--headless] [--channel chrome] [--pretty]
  search-notes --keyword <text> [--limit 20] [--scroll 25] [--headless] [--channel chrome] [--pretty]
  list-notes [--limit 20] [--scroll 25] [--headless] [--channel chrome] [--pretty]
  list-boards [--limit 20] [--headless] [--channel chrome] [--pretty]
  list-board-items (--url <board_url> | --board-id <id>) [--limit 20] [--scroll 25] [--headless] [--channel chrome] [--pretty]
  list-user-notes (--url <profile_url> | --profile-id <id>) [--limit 20] [--scroll 25] [--headless] [--channel chrome] [--pretty]
  note-detail (--url <note_url> | --note-id <id> [--xsec-token <token>]) [--headless] [--channel chrome] [--pretty]
  note-comments (--url <note_url> | --note-id <id> [--xsec-token <token>]) [--limit 20] [--headless] [--channel chrome] [--pretty]
  like-note (--url <note_url> | --note-id <id> [--xsec-token <token>]) [--unlike] [--headless] [--channel chrome] [--pretty]
  favorite-note (--url <note_url> | --note-id <id> [--xsec-token <token>]) [--unfavorite] [--headless] [--channel chrome] [--pretty]
  post-comment (--url <note_url> | --note-id <id> [--xsec-token <token>]) --content <text> [--headless] [--channel chrome] [--pretty]
  reply-comment (--url <note_url> | --note-id <id> [--xsec-token <token>]) (--comment-id <id> | --user-id <id>) --content <text> [--headless] [--channel chrome] [--pretty]
  publish-note --title <text> --content <text> [--image <pathOrUrl>]... [--tag <text>]... [--topic <text>]... [--visibility <text>] [--schedule-at <date>] [--product <text>]... [--headless] [--channel chrome] [--pretty]
  publish-video --title <text> --content <text> --video <path> [--tag <text>]... [--topic <text>]... [--visibility <text>] [--schedule-at <date>] [--product <text>]... [--headless] [--channel chrome] [--pretty]
  creator-dashboard [--headless] [--channel chrome] [--pretty]
  creator-content-metrics [--limit 20] [--headless] [--channel chrome] [--pretty]
  creator-fan-metrics [--headless] [--channel chrome] [--pretty]
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
        const parsed = parseCommon(rest, {
          target: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await login({
          channel: parsed.values.channel,
          target: parsed.values.target
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

      case "doctor-full": {
        const parsed = parseCommon(rest);
        pretty = parsed.values.pretty;
        payload = await doctorFull({
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "home-feed": {
        const parsed = parseCommon(rest, {
          limit: { type: "string" },
          scroll: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await listHomeFeed({
          limit: parsed.values.limit,
          scroll: parsed.values.scroll,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "search-notes": {
        const parsed = parseCommon(rest, {
          keyword: { type: "string" },
          limit: { type: "string" },
          scroll: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await searchNotes({
          keyword: parsed.values.keyword,
          limit: parsed.values.limit,
          scroll: parsed.values.scroll,
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

      case "list-user-notes": {
        const parsed = parseCommon(rest, {
          url: { type: "string" },
          "profile-id": { type: "string" },
          limit: { type: "string" },
          scroll: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await listUserNotes({
          url: parsed.values.url,
          profileId: parsed.values["profile-id"],
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

      case "note-comments": {
        const parsed = parseCommon(rest, {
          url: { type: "string" },
          "note-id": { type: "string" },
          "xsec-token": { type: "string" },
          limit: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await getNoteComments({
          url: parsed.values.url,
          noteId: parsed.values["note-id"],
          xsecToken: parsed.values["xsec-token"],
          limit: parsed.values.limit,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "like-note": {
        const parsed = parseCommon(rest, {
          url: { type: "string" },
          "note-id": { type: "string" },
          "xsec-token": { type: "string" },
          unlike: { type: "boolean", default: false }
        });
        pretty = parsed.values.pretty;
        payload = await likeNote({
          url: parsed.values.url,
          noteId: parsed.values["note-id"],
          xsecToken: parsed.values["xsec-token"],
          unlike: parsed.values.unlike,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "favorite-note": {
        const parsed = parseCommon(rest, {
          url: { type: "string" },
          "note-id": { type: "string" },
          "xsec-token": { type: "string" },
          unfavorite: { type: "boolean", default: false }
        });
        pretty = parsed.values.pretty;
        payload = await favoriteNote({
          url: parsed.values.url,
          noteId: parsed.values["note-id"],
          xsecToken: parsed.values["xsec-token"],
          unfavorite: parsed.values.unfavorite,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "post-comment": {
        const parsed = parseCommon(rest, {
          url: { type: "string" },
          "note-id": { type: "string" },
          "xsec-token": { type: "string" },
          content: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await postComment({
          url: parsed.values.url,
          noteId: parsed.values["note-id"],
          xsecToken: parsed.values["xsec-token"],
          content: parsed.values.content,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "reply-comment": {
        const parsed = parseCommon(rest, {
          url: { type: "string" },
          "note-id": { type: "string" },
          "xsec-token": { type: "string" },
          "comment-id": { type: "string" },
          "user-id": { type: "string" },
          content: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await replyComment({
          url: parsed.values.url,
          noteId: parsed.values["note-id"],
          xsecToken: parsed.values["xsec-token"],
          commentId: parsed.values["comment-id"],
          userId: parsed.values["user-id"],
          content: parsed.values.content,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "publish-note": {
        const parsed = parseCommon(rest, {
          title: { type: "string" },
          content: { type: "string" },
          image: { type: "string", multiple: true },
          tag: { type: "string", multiple: true },
          topic: { type: "string", multiple: true },
          visibility: { type: "string" },
          "schedule-at": { type: "string" },
          product: { type: "string", multiple: true }
        });
        pretty = parsed.values.pretty;
        payload = await publishNote({
          title: parsed.values.title,
          content: parsed.values.content,
          images: parsed.values.image ?? [],
          tags: parsed.values.tag ?? [],
          topics: parsed.values.topic ?? [],
          visibility: parsed.values.visibility,
          scheduleAt: parsed.values["schedule-at"],
          products: parsed.values.product ?? [],
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "publish-video": {
        const parsed = parseCommon(rest, {
          title: { type: "string" },
          content: { type: "string" },
          video: { type: "string" },
          tag: { type: "string", multiple: true },
          topic: { type: "string", multiple: true },
          visibility: { type: "string" },
          "schedule-at": { type: "string" },
          product: { type: "string", multiple: true }
        });
        pretty = parsed.values.pretty;
        payload = await publishVideo({
          title: parsed.values.title,
          content: parsed.values.content,
          video: parsed.values.video,
          tags: parsed.values.tag ?? [],
          topics: parsed.values.topic ?? [],
          visibility: parsed.values.visibility,
          scheduleAt: parsed.values["schedule-at"],
          products: parsed.values.product ?? [],
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "creator-dashboard": {
        const parsed = parseCommon(rest);
        pretty = parsed.values.pretty;
        payload = await getCreatorDashboard({
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "creator-content-metrics": {
        const parsed = parseCommon(rest, {
          limit: { type: "string" }
        });
        pretty = parsed.values.pretty;
        payload = await getCreatorContentMetrics({
          limit: parsed.values.limit,
          headless: parsed.values.headless,
          channel: parsed.values.channel
        });
        break;
      }

      case "creator-fan-metrics": {
        const parsed = parseCommon(rest);
        pretty = parsed.values.pretty;
        payload = await getCreatorFanMetrics({
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
