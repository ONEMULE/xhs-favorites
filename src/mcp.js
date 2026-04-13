#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  doctor,
  getSavedNoteDetail,
  listBoardItems,
  listSavedBoards,
  listSavedNotes,
  login
} from "./service.js";
import { toErrorPayload } from "./errors.js";

function jsonContent(payload) {
  return [
    {
      type: "text",
      text: JSON.stringify(payload)
    }
  ];
}

function wrapTool(handler) {
  return async (args) => {
    try {
      const payload = await handler(args);
      return { content: jsonContent(payload) };
    } catch (error) {
      throw new Error(JSON.stringify(toErrorPayload(error)));
    }
  };
}

const server = new McpServer({
  name: "xhs-favorites",
  version: "0.1.0",
  protocolVersion: "2024-11-05",
  capabilities: {
    tools: true
  }
});

server.tool(
  "login",
  "Open the Playwright CLI in a dedicated persistent profile so the user can log into XiaoHongShu manually.",
  {
    channel: z.string().optional()
  },
  wrapTool(async ({ channel }) => login({ channel }))
);

server.tool(
  "doctor",
  "Check whether the persistent XiaoHongShu profile is authenticated, blocked by risk control, or missing login.",
  {
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ headless, channel }) => doctor({ headless, channel }))
);

server.tool(
  "list_saved_notes",
  "List saved XiaoHongShu notes from the current authenticated profile.",
  {
    limit: z.number().int().positive().optional(),
    scroll: z.number().int().nonnegative().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ limit, scroll, headless, channel }) =>
    listSavedNotes({ limit, scroll, headless, channel })
  )
);

server.tool(
  "list_saved_boards",
  "List favorite boards from the current authenticated XiaoHongShu profile.",
  {
    limit: z.number().int().positive().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ limit, headless, channel }) =>
    listSavedBoards({ limit, headless, channel })
  )
);

server.tool(
  "list_board_items",
  "List notes inside a saved XiaoHongShu board.",
  {
    url: z.string().optional(),
    board_id: z.string().optional(),
    limit: z.number().int().positive().optional(),
    scroll: z.number().int().nonnegative().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, board_id: boardId, limit, scroll, headless, channel }) =>
    listBoardItems({ url, boardId, limit, scroll, headless, channel })
  )
);

server.tool(
  "get_saved_note_detail",
  "Get a XiaoHongShu note detail page using the authenticated persistent profile.",
  {
    url: z.string().optional(),
    note_id: z.string().optional(),
    xsec_token: z.string().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, note_id: noteId, xsec_token: xsecToken, headless, channel }) =>
    getSavedNoteDetail({ url, noteId, xsecToken, headless, channel })
  )
);

const transport = new StdioServerTransport();
await server.connect(transport);
