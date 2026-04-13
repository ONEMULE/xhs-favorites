import {
  DEFAULT_CHANNEL,
  DEFAULT_LIMIT,
  DEFAULT_SCROLL_ITERATIONS,
  XHS_EXPLORE_URL
} from "./constants.js";
import {
  buildBoardUrl,
  buildNoteUrl,
  classifySnapshot,
  isEmptyFavoritesText,
  normalizeBoardFeedEntry,
  normalizeBoards,
  normalizeNoteDetail,
  normalizeSavedNotes,
  parseBoardId,
  parseNoteIdFromUrl,
  parseXsecTokenFromUrl
} from "./extractors.js";
import { ErrorCodes, XhsFavoritesError } from "./errors.js";
import {
  captureSnapshot,
  ensureAuthenticated,
  gotoAndWait,
  launchPersistentSession,
  openLoginBrowser,
  profileExists,
  resolveCurrentProfileId,
  waitForNetworkIdle
} from "./session.js";

function requireLimit(limit) {
  const numeric = Number(limit ?? DEFAULT_LIMIT);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "limit must be a positive integer");
  }
  return numeric;
}

function requireScroll(scroll) {
  const numeric = Number(scroll ?? DEFAULT_SCROLL_ITERATIONS);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "scroll must be a non-negative integer");
  }
  return numeric;
}

async function withPersistentSession(options, handler) {
  const { context, page } = await launchPersistentSession(options);
  try {
    return await handler(page);
  } finally {
    await context.close();
  }
}

async function diagnosePage(page) {
  const snapshot = await captureSnapshot(page);
  return {
    login_state: classifySnapshot(snapshot),
    profile_dir_exists: profileExists(),
    ...snapshot
  };
}

async function readSavedNotesRaw(page) {
  return page.evaluate(
    () => globalThis.__INITIAL_STATE__?.user?.notes?._rawValue?.[1] ?? null
  );
}

async function readBoardsRaw(page) {
  return page.evaluate(
    () => globalThis.__INITIAL_STATE__?.board?.userBoardList?._rawValue ?? null
  );
}

async function readBoardFeedEntryRaw(page, boardId) {
  return page.evaluate(
    (resolvedBoardId) => {
      const map = globalThis.__INITIAL_STATE__?.board?.boardFeedsMap?._rawValue ?? null;
      if (!map || typeof map !== "object") {
        return null;
      }
      return map[resolvedBoardId] ?? map[String(resolvedBoardId)] ?? null;
    },
    boardId
  );
}

async function readNoteRaw(page, noteIdHint = null) {
  return page.evaluate((resolvedNoteId) => {
    const state = globalThis.__INITIAL_STATE__;
    const legacy = state?.noteData?.data?.noteData;
    if (legacy) {
      return legacy;
    }

    if (resolvedNoteId) {
      const byId = state?.note?.noteDetailMap?.[resolvedNoteId]?.note;
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

    if (!resolvedNoteId) {
      const map = state?.note?.noteDetailMap;
      if (map && typeof map === "object") {
        for (const key of Object.keys(map)) {
          const note = map[key]?.note;
          if (note) {
            return note;
          }
        }
      }
    }

    return null;
  }, noteIdHint);
}

async function scrollPage(page) {
  await page.mouse.wheel(0, 1400);
  await waitForNetworkIdle(page, 8_000);
  await page.waitForTimeout(600);
}

async function collectSavedNotes(page, limit, scroll) {
  const target = limit + 1;
  let lastLength = -1;
  let stableIterations = 0;
  let items = null;

  for (let attempt = 0; attempt <= scroll; attempt += 1) {
    const raw = await readSavedNotesRaw(page);
    items = normalizeSavedNotes(raw);
    if (items === null) {
      return null;
    }

    if (items.length >= target) {
      return {
        items,
        has_more: true,
        next_cursor: null
      };
    }

    if (items.length === lastLength) {
      stableIterations += 1;
    } else {
      stableIterations = 0;
      lastLength = items.length;
    }

    if (stableIterations >= 3 || attempt === scroll) {
      break;
    }

    await scrollPage(page);
  }

  return {
    items: items ?? [],
    has_more: false,
    next_cursor: null
  };
}

async function collectBoardItems(page, boardId, limit, scroll) {
  const target = limit + 1;
  let lastLength = -1;
  let stableIterations = 0;
  let normalized = null;

  for (let attempt = 0; attempt <= scroll; attempt += 1) {
    const raw = await readBoardFeedEntryRaw(page, boardId);
    normalized = normalizeBoardFeedEntry(raw, boardId);
    if (normalized === null) {
      return null;
    }

    if (normalized.items.length >= target) {
      return {
        ...normalized,
        has_more: true
      };
    }

    if (!normalized.has_more) {
      return normalized;
    }

    if (normalized.items.length === lastLength) {
      stableIterations += 1;
    } else {
      stableIterations = 0;
      lastLength = normalized.items.length;
    }

    if (stableIterations >= 3 || attempt === scroll) {
      break;
    }

    await scrollPage(page);
  }

  return normalized;
}

function trimItems(items, limit) {
  return items.slice(0, limit);
}

export async function doctor({
  headless = false,
  channel = DEFAULT_CHANNEL
} = {}) {
  return withPersistentSession({ headless, channel }, async (page) => {
    await gotoAndWait(page, XHS_EXPLORE_URL);
    const diagnosis = await diagnosePage(page);

    let profileId = null;
    if (diagnosis.login_state === "authenticated") {
      try {
        profileId = await resolveCurrentProfileId(page);
      } catch {
        profileId = null;
      }
    }

    return {
      ok: diagnosis.login_state === "authenticated",
      profile_dir_exists: diagnosis.profile_dir_exists,
      login_state: diagnosis.login_state,
      page_url: diagnosis.url,
      page_title: diagnosis.title,
      profile_id: profileId
    };
  });
}

export async function login({
  channel = DEFAULT_CHANNEL
} = {}) {
  await openLoginBrowser({ channel });
  return doctor({ headless: false, channel });
}

export async function listSavedNotes({
  limit = DEFAULT_LIMIT,
  scroll = DEFAULT_SCROLL_ITERATIONS,
  headless = false,
  channel = DEFAULT_CHANNEL
} = {}) {
  const resolvedLimit = requireLimit(limit);
  const resolvedScroll = requireScroll(scroll);

  return withPersistentSession({ headless, channel }, async (page) => {
    await ensureAuthenticated(page);
    const profileId = await resolveCurrentProfileId(page);
    await gotoAndWait(page, `https://www.xiaohongshu.com/user/profile/${profileId}?tab=fav&subTab=note`);

    const diagnosis = await diagnosePage(page);
    if (diagnosis.login_state === "risk_controlled") {
      throw new XhsFavoritesError(ErrorCodes.RISK_CONTROLLED, "Risk control page detected on favorites notes page.", {
        page_url: diagnosis.url
      });
    }

    const collected = await collectSavedNotes(page, resolvedLimit, resolvedScroll);
    if (collected === null) {
      throw new XhsFavoritesError(
        ErrorCodes.SELECTOR_CHANGED,
        "Could not find the saved notes state inside __INITIAL_STATE__.",
        await captureSnapshot(page)
      );
    }

    if (collected.items.length === 0 && isEmptyFavoritesText(diagnosis.body_text)) {
      throw new XhsFavoritesError(ErrorCodes.EMPTY_STATE, "No saved notes were found.", {
        page_url: diagnosis.url
      });
    }

    return {
      source: "favorites",
      profile_id: profileId,
      items: trimItems(collected.items, resolvedLimit),
      next_cursor: collected.next_cursor,
      has_more: Boolean(collected.has_more)
    };
  });
}

export async function listSavedBoards({
  limit = DEFAULT_LIMIT,
  headless = false,
  channel = DEFAULT_CHANNEL
} = {}) {
  const resolvedLimit = requireLimit(limit);

  return withPersistentSession({ headless, channel }, async (page) => {
    await ensureAuthenticated(page);
    const profileId = await resolveCurrentProfileId(page);
    await gotoAndWait(page, `https://www.xiaohongshu.com/user/profile/${profileId}?tab=fav&subTab=board`);

    const diagnosis = await diagnosePage(page);
    if (diagnosis.login_state === "risk_controlled") {
      throw new XhsFavoritesError(ErrorCodes.RISK_CONTROLLED, "Risk control page detected on favorites boards page.", {
        page_url: diagnosis.url
      });
    }

    const rawBoards = await readBoardsRaw(page);
    const boards = normalizeBoards(rawBoards);

    if (boards === null) {
      throw new XhsFavoritesError(
        ErrorCodes.SELECTOR_CHANGED,
        "Could not find the saved boards state inside __INITIAL_STATE__.",
        await captureSnapshot(page)
      );
    }

    if (boards.length === 0 && isEmptyFavoritesText(diagnosis.body_text)) {
      throw new XhsFavoritesError(ErrorCodes.EMPTY_STATE, "No favorite boards were found.", {
        page_url: diagnosis.url
      });
    }

    return {
      source: "favorite_boards",
      profile_id: profileId,
      items: trimItems(boards, resolvedLimit)
    };
  });
}

export async function listBoardItems({
  url = null,
  boardId = null,
  limit = DEFAULT_LIMIT,
  scroll = DEFAULT_SCROLL_ITERATIONS,
  headless = false,
  channel = DEFAULT_CHANNEL
} = {}) {
  const resolvedBoardId = parseBoardId(url || boardId || "");
  if (!resolvedBoardId) {
    throw new XhsFavoritesError(
      ErrorCodes.INVALID_INPUT,
      "Provide --url or --board-id for list-board-items."
    );
  }

  const resolvedLimit = requireLimit(limit);
  const resolvedScroll = requireScroll(scroll);

  return withPersistentSession({ headless, channel }, async (page) => {
    await ensureAuthenticated(page);
    await gotoAndWait(page, buildBoardUrl(resolvedBoardId));

    const diagnosis = await diagnosePage(page);
    if (diagnosis.login_state === "risk_controlled") {
      throw new XhsFavoritesError(ErrorCodes.RISK_CONTROLLED, "Risk control page detected on board page.", {
        page_url: diagnosis.url
      });
    }

    const collected = await collectBoardItems(page, resolvedBoardId, resolvedLimit, resolvedScroll);
    if (collected === null) {
      throw new XhsFavoritesError(
        ErrorCodes.SELECTOR_CHANGED,
        "Could not find the board feed state inside __INITIAL_STATE__.",
        await captureSnapshot(page)
      );
    }

    if (collected.items.length === 0 && isEmptyFavoritesText(diagnosis.body_text)) {
      throw new XhsFavoritesError(ErrorCodes.EMPTY_STATE, "No notes were found inside the selected board.", {
        page_url: diagnosis.url
      });
    }

    return {
      source: "favorite_board",
      board_id: resolvedBoardId,
      board_url: buildBoardUrl(resolvedBoardId),
      items: trimItems(collected.items, resolvedLimit),
      next_cursor: collected.next_cursor,
      has_more: Boolean(collected.has_more)
    };
  });
}

export async function getSavedNoteDetail({
  url = null,
  noteId = null,
  xsecToken = null,
  headless = false,
  channel = DEFAULT_CHANNEL
} = {}) {
  let noteUrl = url;
  if (!noteUrl) {
    const resolvedNoteId = noteId?.trim();
    if (!resolvedNoteId) {
      throw new XhsFavoritesError(
        ErrorCodes.INVALID_INPUT,
        "Provide --url or --note-id for note-detail."
      );
    }
    noteUrl = buildNoteUrl(resolvedNoteId, xsecToken?.trim() || null);
  }

  const noteIdHint = parseNoteIdFromUrl(noteUrl) || noteId || null;
  const tokenHint = parseXsecTokenFromUrl(noteUrl) || xsecToken || null;

  return withPersistentSession({ headless, channel }, async (page) => {
    await ensureAuthenticated(page);
    await gotoAndWait(page, noteUrl);

    const diagnosis = await diagnosePage(page);
    if (diagnosis.login_state === "risk_controlled") {
      throw new XhsFavoritesError(ErrorCodes.RISK_CONTROLLED, "Risk control page detected on note detail page.", {
        page_url: diagnosis.url
      });
    }

    const rawNote = await readNoteRaw(page, noteIdHint);
    const normalized = normalizeNoteDetail(rawNote, { noteUrl });

    if (!normalized) {
      throw new XhsFavoritesError(
        ErrorCodes.SELECTOR_CHANGED,
        "Could not find the note detail state inside __INITIAL_STATE__.",
        {
          ...(await captureSnapshot(page)),
          note_id: noteIdHint,
          xsec_token: tokenHint
        }
      );
    }

    return normalized;
  });
}
