import {
  buildNoteUrl,
  normalizeNoteDetail,
  normalizeSavedNotes,
  parseNoteIdFromUrl,
  parseXsecTokenFromUrl
} from "../extractors.js";
import { ErrorCodes, XhsFavoritesError } from "../errors.js";
import { fetchInitialState } from "../state.js";

function trimItems(items, limit) {
  return items.slice(0, limit);
}

function normalizeCommentList(rawComments, { limit = 20 } = {}) {
  if (!Array.isArray(rawComments)) {
    return [];
  }

  return rawComments.slice(0, limit).map((comment) => {
    const user = comment?.userInfo ?? comment?.user ?? {};
    const replies = Array.isArray(comment?.subComments) ? comment.subComments : [];
    return {
      comment_id: String(comment?.id ?? comment?.commentId ?? "").trim() || null,
      content: comment?.content ?? comment?.text ?? null,
      author: user?.nickname ?? user?.nickName ?? user?.name ?? null,
      user_id: user?.userId ?? user?.id ?? null,
      like_count: comment?.likeCount ?? comment?.likedCount ?? null,
      reply_count: replies.length,
      replies: replies.map((reply) => {
        const replyUser = reply?.userInfo ?? reply?.user ?? {};
        return {
          comment_id: String(reply?.id ?? reply?.commentId ?? "").trim() || null,
          content: reply?.content ?? reply?.text ?? null,
          author: replyUser?.nickname ?? replyUser?.nickName ?? replyUser?.name ?? null,
          user_id: replyUser?.userId ?? replyUser?.id ?? null,
          like_count: reply?.likeCount ?? reply?.likedCount ?? null
        };
      })
    };
  });
}

function extractNoteDetailFromState(state, noteIdHint = null) {
  const legacy = state?.noteData?.data?.noteData;
  if (legacy) {
    return legacy;
  }

  if (noteIdHint) {
    const byId = state?.note?.noteDetailMap?.[noteIdHint]?.note;
    if (byId) {
      return byId;
    }
  }

  const currentId = state?.note?.currentNoteId;
  if (currentId) {
    const byCurrent = state?.note?.noteDetailMap?.[currentId]?.note;
    if (byCurrent) {
      return byCurrent;
    }
  }

  return null;
}

function extractNoteCommentsFromState(state, noteIdHint = null) {
  if (noteIdHint) {
    const byId = state?.note?.noteDetailMap?.[noteIdHint]?.comments;
    if (byId) {
      return byId;
    }
  }

  const currentId = state?.note?.currentNoteId;
  if (currentId) {
    return state?.note?.noteDetailMap?.[currentId]?.comments ?? null;
  }

  return null;
}

export const apiProvider = {
  name: "api",

  async getCapabilities() {
    return {
      provider: "api",
      list_home_feed: true,
      get_note_detail: true,
      get_note_comments: true,
      search_notes: false,
      list_user_notes: false,
      list_saved_notes: false,
      list_saved_boards: false,
      list_board_items: false,
      like_note: false,
      favorite_note: false,
      post_comment: false,
      reply_comment: false,
      publish_note: false,
      publish_video: false,
      creator_dashboard: false,
      creator_content_metrics: false,
      creator_fan_metrics: false
    };
  },

  async listHomeFeed({ limit = 20 }) {
    const state = await fetchInitialState("https://www.xiaohongshu.com/explore");
    const items = normalizeSavedNotes(state?.feed?.feeds ?? []);
    if (items === null) {
      throw new XhsFavoritesError(
        ErrorCodes.SELECTOR_CHANGED,
        "Could not read the home feed from the public page state."
      );
    }

    return {
      source: "home_feed",
      provider: "api",
      items: trimItems(items, limit),
      next_cursor: null,
      has_more: items.length > limit
    };
  },

  async getNoteDetail({ url = null, noteId = null, xsecToken = null }) {
    let noteUrl = url;
    if (!noteUrl) {
      if (!noteId) {
        throw new XhsFavoritesError(
          ErrorCodes.INVALID_INPUT,
          "Provide --url or --note-id for getNoteDetail."
        );
      }
      noteUrl = buildNoteUrl(noteId, xsecToken);
    }

    const noteIdHint = parseNoteIdFromUrl(noteUrl) || noteId || null;
    const state = await fetchInitialState(noteUrl);
    const rawNote = extractNoteDetailFromState(state, noteIdHint);
    const normalized = normalizeNoteDetail(rawNote, { noteUrl });
    if (!normalized) {
      throw new XhsFavoritesError(
        ErrorCodes.SELECTOR_CHANGED,
        "Could not read note detail data from the public page state.",
        { page_url: noteUrl }
      );
    }

    return {
      ...normalized,
      provider: "api"
    };
  },

  async getNoteComments({ url = null, noteId = null, xsecToken = null, limit = 20 }) {
    let noteUrl = url;
    if (!noteUrl) {
      if (!noteId) {
        throw new XhsFavoritesError(
          ErrorCodes.INVALID_INPUT,
          "Provide --url or --note-id for getNoteComments."
        );
      }
      noteUrl = buildNoteUrl(noteId, xsecToken);
    }

    const noteIdHint = parseNoteIdFromUrl(noteUrl) || noteId || null;
    const state = await fetchInitialState(noteUrl);
    const commentState = extractNoteCommentsFromState(state, noteIdHint);
    const items = normalizeCommentList(commentState?.list ?? [], { limit });

    if (!items.length && commentState?.hasMore) {
      throw new XhsFavoritesError(
        ErrorCodes.CAPABILITY_UNAVAILABLE,
        "Public HTML did not include an initial comment payload. Retry through the browser provider.",
        { provider: "api", page_url: noteUrl }
      );
    }

    return {
      source: "note_comments",
      provider: "api",
      items,
      next_cursor: commentState?.cursor ?? null,
      has_more: Boolean(commentState?.hasMore)
    };
  },

  async searchNotes() {
    throw new XhsFavoritesError(
      ErrorCodes.CAPABILITY_UNAVAILABLE,
      "Search results are not consistently embedded in public HTML. Use the browser provider."
    );
  },

  async listUserNotes() {
    throw new XhsFavoritesError(
      ErrorCodes.CAPABILITY_UNAVAILABLE,
      "User note lists are not consistently embedded in public HTML. Use the browser provider."
    );
  }
};
