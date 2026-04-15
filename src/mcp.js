#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import packageJson from "../package.json" with { type: "json" };
import {
  doctor,
  doctorFull,
  favoriteNote,
  getCreatorContentMetrics,
  getCreatorDashboard,
  getCreatorFanMetrics,
  getNoteComments,
  getNoteDetail,
  getSavedNoteDetail,
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
  version: packageJson.version,
  protocolVersion: "2024-11-05",
  capabilities: {
    tools: true
  }
});

server.tool(
  "login",
  "Open the Playwright CLI in a dedicated persistent profile so the user can log into XiaoHongShu manually.",
  {
    channel: z.string().optional(),
    target: z.string().optional()
  },
  wrapTool(async ({ channel, target }) => login({ channel, target }))
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
  "doctor_full",
  "Return login health plus provider capability routing details.",
  {
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ headless, channel }) => doctorFull({ headless, channel }))
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
  "list_home_feed",
  "List XiaoHongShu home feed notes.",
  {
    limit: z.number().int().positive().optional(),
    scroll: z.number().int().nonnegative().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ limit, scroll, headless, channel }) =>
    listHomeFeed({ limit, scroll, headless, channel })
  )
);

server.tool(
  "search_notes",
  "Search XiaoHongShu notes by keyword.",
  {
    keyword: z.string(),
    limit: z.number().int().positive().optional(),
    scroll: z.number().int().nonnegative().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ keyword, limit, scroll, headless, channel }) =>
    searchNotes({ keyword, limit, scroll, headless, channel })
  )
);

server.tool(
  "list_user_notes",
  "List a XiaoHongShu user's public notes.",
  {
    url: z.string().optional(),
    profile_id: z.string().optional(),
    limit: z.number().int().positive().optional(),
    scroll: z.number().int().nonnegative().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, profile_id: profileId, limit, scroll, headless, channel }) =>
    listUserNotes({ url, profileId, limit, scroll, headless, channel })
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
  "get_note_detail",
  "Get a XiaoHongShu note detail page through the unified provider router.",
  {
    url: z.string().optional(),
    note_id: z.string().optional(),
    xsec_token: z.string().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, note_id: noteId, xsec_token: xsecToken, headless, channel }) =>
    getNoteDetail({ url, noteId, xsecToken, headless, channel })
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

server.tool(
  "get_note_comments",
  "Get comments for a XiaoHongShu note.",
  {
    url: z.string().optional(),
    note_id: z.string().optional(),
    xsec_token: z.string().optional(),
    limit: z.number().int().positive().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, note_id: noteId, xsec_token: xsecToken, limit, headless, channel }) =>
    getNoteComments({ url, noteId, xsecToken, limit, headless, channel })
  )
);

server.tool(
  "like_note",
  "Like or unlike a XiaoHongShu note.",
  {
    url: z.string().optional(),
    note_id: z.string().optional(),
    xsec_token: z.string().optional(),
    unlike: z.boolean().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, note_id: noteId, xsec_token: xsecToken, unlike, headless, channel }) =>
    likeNote({ url, noteId, xsecToken, unlike, headless, channel })
  )
);

server.tool(
  "favorite_note",
  "Favorite or unfavorite a XiaoHongShu note.",
  {
    url: z.string().optional(),
    note_id: z.string().optional(),
    xsec_token: z.string().optional(),
    unfavorite: z.boolean().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, note_id: noteId, xsec_token: xsecToken, unfavorite, headless, channel }) =>
    favoriteNote({ url, noteId, xsecToken, unfavorite, headless, channel })
  )
);

server.tool(
  "post_comment",
  "Post a comment to a XiaoHongShu note.",
  {
    url: z.string().optional(),
    note_id: z.string().optional(),
    xsec_token: z.string().optional(),
    content: z.string(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, note_id: noteId, xsec_token: xsecToken, content, headless, channel }) =>
    postComment({ url, noteId, xsecToken, content, headless, channel })
  )
);

server.tool(
  "reply_comment",
  "Reply to a comment on a XiaoHongShu note.",
  {
    url: z.string().optional(),
    note_id: z.string().optional(),
    xsec_token: z.string().optional(),
    comment_id: z.string().optional(),
    user_id: z.string().optional(),
    content: z.string(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ url, note_id: noteId, xsec_token: xsecToken, comment_id: commentId, user_id: userId, content, headless, channel }) =>
    replyComment({ url, noteId, xsecToken, commentId, userId, content, headless, channel })
  )
);

server.tool(
  "publish_note",
  "Publish a XiaoHongShu image note through the unified provider router.",
  {
    title: z.string(),
    content: z.string(),
    images: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    topics: z.array(z.string()).optional(),
    visibility: z.string().optional(),
    schedule_at: z.string().optional(),
    products: z.array(z.string()).optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ title, content, images, tags, topics, visibility, schedule_at: scheduleAt, products, headless, channel }) =>
    publishNote({ title, content, images, tags, topics, visibility, scheduleAt, products, headless, channel })
  )
);

server.tool(
  "publish_video",
  "Publish a XiaoHongShu video note through the unified provider router.",
  {
    title: z.string(),
    content: z.string(),
    video: z.string(),
    tags: z.array(z.string()).optional(),
    topics: z.array(z.string()).optional(),
    visibility: z.string().optional(),
    schedule_at: z.string().optional(),
    products: z.array(z.string()).optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ title, content, video, tags, topics, visibility, schedule_at: scheduleAt, products, headless, channel }) =>
    publishVideo({ title, content, video, tags, topics, visibility, scheduleAt, products, headless, channel })
  )
);

server.tool(
  "get_creator_dashboard",
  "Get creator center overview data.",
  {
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ headless, channel }) =>
    getCreatorDashboard({ headless, channel })
  )
);

server.tool(
  "get_creator_content_metrics",
  "Get creator content metrics data.",
  {
    limit: z.number().int().positive().optional(),
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ limit, headless, channel }) =>
    getCreatorContentMetrics({ limit, headless, channel })
  )
);

server.tool(
  "get_creator_fan_metrics",
  "Get creator fan metrics data.",
  {
    headless: z.boolean().optional(),
    channel: z.string().optional()
  },
  wrapTool(async ({ headless, channel }) =>
    getCreatorFanMetrics({ headless, channel })
  )
);

const transport = new StdioServerTransport();
await server.connect(transport);
