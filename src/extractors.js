import { XHS_HOST } from "./constants.js";

export function parseChineseCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/,/g, "");
  if (normalized.endsWith("万")) {
    const base = Number(normalized.slice(0, -1));
    return Number.isFinite(base) ? Math.round(base * 10_000) : null;
  }

  const digits = normalized.replace(/[^\d.]/g, "");
  if (!digits) {
    return null;
  }

  const numeric = Number(digits);
  return Number.isFinite(numeric) ? numeric : null;
}

function pickFirstValue(values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      continue;
    }

    return value;
  }

  return null;
}

function pickFirstNumber(values) {
  for (const value of values) {
    const numeric = parseChineseCount(value);
    if (numeric !== null) {
      return numeric;
    }
  }
  return null;
}

function normalizeUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return trimmed;
}

export function extractProfileIdFromHref(href) {
  if (typeof href !== "string") {
    return null;
  }

  const match = href.match(/\/user\/profile\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function parseBoardId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/\/board\/([^/?#]+)/);
  return match?.[1] ?? trimmed;
}

export function parseNoteIdFromUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  const match = url.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function parseXsecTokenFromUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("xsec_token");
  } catch {
    return null;
  }
}

export function buildBoardUrl(boardId) {
  return `${XHS_HOST}/board/${boardId}?source=web_user_page`;
}

export function buildNoteUrl(noteId, xsecToken) {
  if (xsecToken) {
    return (
      `${XHS_HOST}/discovery/item/${noteId}` +
      `?source=webshare&xhsshare=pc_web&xsec_token=${encodeURIComponent(xsecToken)}` +
      "&xsec_source=pc_share"
    );
  }

  return `${XHS_HOST}/explore/${noteId}`;
}

export function normalizeSavedNotes(rawItems, { boardName = null } = {}) {
  if (!Array.isArray(rawItems)) {
    return null;
  }

  return rawItems
    .filter((item) => item && typeof item === "object" && item.noteCard)
    .map((item) => {
      const card = item.noteCard ?? {};
      const user = card.user ?? {};
      const cover = card.cover ?? {};
      const interact = card.interactInfo ?? card.interactInfoV2 ?? {};
      const noteId = pickFirstValue([item.id, item.noteId, card.noteId]);
      const xsecToken = pickFirstValue([item.xsecToken, card.xsecToken]);

      return {
        note_id: noteId ? String(noteId).trim() : null,
        xsec_token: xsecToken ? String(xsecToken).trim() : null,
        title: pickFirstValue([card.displayTitle, card.title]),
        author: pickFirstValue([user.nickName, user.nickname, user.name]),
        cover_url: normalizeUrl(
          pickFirstValue([cover.urlDefault, cover.url, cover.urlPre, cover.infoList?.[0]?.url])
        ),
        note_url: noteId ? buildNoteUrl(String(noteId).trim(), xsecToken ? String(xsecToken).trim() : null) : null,
        like_count: pickFirstNumber([
          interact.likedCount,
          interact.likes,
          interact.likeCount,
          card.likedCount
        ]),
        comment_count: pickFirstNumber([
          interact.commentCount,
          interact.comments,
          interact.commentCnt,
          card.commentCount
        ]),
        board_name: boardName
      };
    })
    .filter((item) => item.note_id && item.note_url);
}

export function normalizeBoards(rawBoards) {
  if (!Array.isArray(rawBoards)) {
    return null;
  }

  return rawBoards
    .filter((board) => board && typeof board === "object")
    .map((board) => {
      const boardId = pickFirstValue([board.id, board.boardId]);
      return {
        board_id: boardId ? String(boardId).trim() : null,
        board_name: pickFirstValue([board.name, board.title]),
        board_url: boardId ? buildBoardUrl(String(boardId).trim()) : null,
        item_count: pickFirstNumber([board.total, board.itemCount]),
        privacy: pickFirstValue([board.privacy]),
        desc: pickFirstValue([board.desc, board.description])
      };
    })
    .filter((board) => board.board_id && board.board_url);
}

export function normalizeBoardFeedEntry(rawEntry, boardId) {
  if (!rawEntry || typeof rawEntry !== "object") {
    return null;
  }

  const notes = Array.isArray(rawEntry.notes)
    ? rawEntry.notes
        .filter((note) => note && typeof note === "object")
        .map((note) => {
          const noteId = pickFirstValue([note.noteId, note.id]);
          const xsecToken = pickFirstValue([note.xsecToken]);
          return {
            note_id: noteId ? String(noteId).trim() : null,
            xsec_token: xsecToken ? String(xsecToken).trim() : null,
            title: pickFirstValue([note.displayTitle, note.title]),
            author: pickFirstValue([note.user?.nickName, note.user?.nickname]),
            cover_url: normalizeUrl(
              pickFirstValue([note.cover?.urlDefault, note.cover?.url, note.cover?.urlPre])
            ),
            note_url: noteId ? buildNoteUrl(String(noteId).trim(), xsecToken ? String(xsecToken).trim() : null) : null,
            like_count: pickFirstNumber([
              note.interactInfo?.likedCount,
              note.interactInfo?.likeCount
            ]),
            comment_count: pickFirstNumber([
              note.interactInfo?.commentCount,
              note.interactInfo?.commentCnt
            ]),
            board_name: pickFirstValue([
              rawEntry.board?.name,
              rawEntry.boardName,
              rawEntry.name
            ])
          };
        })
        .filter((item) => item.note_id && item.note_url)
    : [];

  return {
    board_id: boardId,
    next_cursor: pickFirstValue([rawEntry.cursor, rawEntry.nextCursor]),
    has_more: Boolean(rawEntry.hasMore),
    items: notes
  };
}

function normalizeVideoStreams(note) {
  const streams = [];
  const streamGroups = note?.video?.media?.stream;

  if (!streamGroups || typeof streamGroups !== "object") {
    return streams;
  }

  for (const [codec, entries] of Object.entries(streamGroups)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      const url = normalizeUrl(pickFirstValue([entry.masterUrl, entry.backupUrl]));
      if (!url) {
        continue;
      }

      streams.push({
        codec,
        url,
        width: pickFirstNumber([entry.width]),
        height: pickFirstNumber([entry.height]),
        size: pickFirstNumber([entry.size]),
        stream_type: pickFirstNumber([entry.streamType])
      });
    }
  }

  return streams;
}

export function normalizeNoteDetail(note, { noteUrl = null } = {}) {
  if (!note || typeof note !== "object") {
    return null;
  }

  const noteId = pickFirstValue([note.id, note.noteId, note.note_id]);
  const user = note.user && typeof note.user === "object" ? note.user : {};
  const interact = note.interactInfo && typeof note.interactInfo === "object" ? note.interactInfo : {};
  const tags = Array.isArray(note.tagList)
    ? note.tagList
        .map((tag) => pickFirstValue([tag.name, tag.tagName]))
        .filter(Boolean)
    : [];
  const images = Array.isArray(note.imageList)
    ? note.imageList
        .map((image) =>
          normalizeUrl(pickFirstValue([image.urlDefault, image.urlPre, image.url, image.infoList?.[0]?.url]))
        )
        .filter(Boolean)
    : [];
  const videoStreams = normalizeVideoStreams(note);

  return {
    note_id: noteId ? String(noteId).trim() : null,
    title: pickFirstValue([note.title, note.displayTitle, note.name]),
    author: pickFirstValue([user.nickname, user.nickName, user.name]),
    content: pickFirstValue([note.desc, note.description, note.content]),
    tags,
    images,
    videos: videoStreams.map((video) => video.url),
    note_url: noteUrl,
    like_count: pickFirstNumber([
      interact.likedCount,
      interact.likeCount,
      note.likedCount
    ]),
    comment_count: pickFirstNumber([
      interact.commentCount,
      interact.commentCnt,
      note.commentCount
    ]),
    collect_count: pickFirstNumber([
      interact.collectedCount,
      interact.collectCount,
      note.collectedCount
    ]),
    published_time: pickFirstValue([note.time, note.lastUpdateTime]),
    note_type: pickFirstValue([note.type]),
    video_streams: videoStreams
  };
}

export function classifySnapshot(snapshot) {
  const title = String(snapshot?.title ?? "");
  const text = String(snapshot?.body_text ?? "");
  const url = String(snapshot?.url ?? "");
  const hasLoginContainer = Boolean(snapshot?.has_login_container);
  const hasProfileLink = Boolean(snapshot?.has_profile_link);
  const sidebarText = String(snapshot?.sidebar_text ?? "").trim();

  if (title.includes("安全限制") || text.includes("安全限制") || text.includes("IP存在风险")) {
    return "risk_controlled";
  }

  if (
    hasLoginContainer ||
    text.includes("扫码登录") ||
    text.includes("登录后查看更多内容") ||
    text.includes("手机号登录")
  ) {
    return "auth_required";
  }

  if (sidebarText === "我" || hasProfileLink || url.includes("/user/profile/")) {
    return "authenticated";
  }

  return "unknown";
}

export function isEmptyFavoritesText(text) {
  const normalized = String(text ?? "");
  return (
    normalized.includes("暂无收藏") ||
    normalized.includes("还没有收藏") ||
    normalized.includes("还没有内容") ||
    normalized.includes("暂无内容")
  );
}
