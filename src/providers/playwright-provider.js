import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_CHANNEL,
  DEFAULT_LIMIT,
  DEFAULT_SCROLL_ITERATIONS,
  XHS_CREATOR_CONTENT_URL,
  XHS_CREATOR_DASHBOARD_URL,
  XHS_CREATOR_FANS_URL,
  XHS_CREATOR_PUBLISH_URL,
  XHS_EXPLORE_URL
} from "../constants.js";
import {
  buildBoardUrl,
  buildNoteUrl,
  classifySnapshot,
  extractProfileIdFromHref,
  isEmptyFavoritesText,
  normalizeBoardFeedEntry,
  normalizeBoards,
  normalizeNoteDetail,
  normalizeSavedNotes,
  parseBoardId,
  parseNoteIdFromUrl,
  parseXsecTokenFromUrl
} from "../extractors.js";
import { ErrorCodes, XhsFavoritesError } from "../errors.js";
import {
  captureSnapshot,
  ensureAuthenticated,
  gotoAndWait,
  launchPersistentSession,
  openLoginBrowser,
  profileExists,
  resolveLoginUrl,
  resolveCurrentProfileId,
  waitForNetworkIdle
} from "../session.js";

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

async function ensureNotBlocked(page, message) {
  const diagnosis = await diagnosePage(page);
  if (diagnosis.login_state === "risk_controlled") {
    throw new XhsFavoritesError(ErrorCodes.RISK_CONTROLLED, message, {
      page_url: diagnosis.url,
      page_title: diagnosis.title
    });
  }
  return diagnosis;
}

async function readSavedNotesRaw(page) {
  return page.evaluate(() => globalThis.__INITIAL_STATE__?.user?.notes?._rawValue?.[1] ?? null);
}

async function readBoardsRaw(page) {
  return page.evaluate(() => globalThis.__INITIAL_STATE__?.board?.userBoardList?._rawValue ?? null);
}

async function readBoardFeedEntryRaw(page, boardId) {
  return page.evaluate((resolvedBoardId) => {
    const map = globalThis.__INITIAL_STATE__?.board?.boardFeedsMap?._rawValue ?? null;
    if (!map || typeof map !== "object") {
      return null;
    }
    return map[resolvedBoardId] ?? map[String(resolvedBoardId)] ?? null;
  }, boardId);
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

async function readNoteCommentState(page, noteIdHint = null) {
  return page.evaluate((resolvedNoteId) => {
    const state = globalThis.__INITIAL_STATE__;
    if (resolvedNoteId) {
      const byId = state?.note?.noteDetailMap?.[resolvedNoteId]?.comments;
      if (byId) {
        return byId;
      }
    }

    const currentId = state?.note?.currentNoteId;
    if (currentId) {
      return state?.note?.noteDetailMap?.[currentId]?.comments ?? null;
    }

    return null;
  }, noteIdHint);
}

async function readHomeFeedRaw(page) {
  return page.evaluate(() =>
    (globalThis.__INITIAL_STATE__?.feed?.feeds ?? []).map((item) => ({
      id: item?.id ?? null,
      xsecToken: item?.xsecToken ?? null,
      noteCard: item?.noteCard ?? null
    }))
  );
}

async function readSearchFeedRaw(page) {
  return page.evaluate(() => {
    const feeds = globalThis.__INITIAL_STATE__?.search?.feeds;
    if (!Array.isArray(feeds)) {
      return null;
    }
    return feeds.map((item) => ({
      id: item?.id ?? null,
      xsecToken: item?.xsecToken ?? null,
      noteCard: item?.noteCard ?? null
    }));
  });
}

async function readUserNotesRaw(page) {
  return page.evaluate(() => {
    const notes = globalThis.__INITIAL_STATE__?.user?.notes;
    if (Array.isArray(notes) && notes.length) {
      return notes[0].map((item) => ({
        id: item?.id ?? null,
        xsecToken: item?.xsecToken ?? null,
        noteCard: item?.noteCard ?? null
      }));
    }
    if (Array.isArray(notes?._rawValue)) {
      const raw = notes._rawValue[0] ?? notes._rawValue[1] ?? [];
      return Array.isArray(raw)
        ? raw.map((item) => ({
            id: item?.id ?? null,
            xsecToken: item?.xsecToken ?? null,
            noteCard: item?.noteCard ?? null
          }))
        : null;
    }
    return null;
  });
}

async function scrollPage(page) {
  await page.mouse.wheel(0, 1400);
  await waitForNetworkIdle(page, 8_000);
  await page.waitForTimeout(600);
}

function trimItems(items, limit) {
  return items.slice(0, limit);
}

async function collectFeedItems(page, reader, normalize, limit, scroll) {
  const target = limit + 1;
  let lastLength = -1;
  let stableIterations = 0;
  let items = null;

  for (let attempt = 0; attempt <= scroll; attempt += 1) {
    const raw = await reader(page);
    items = normalize(raw);
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

async function fallbackSearchDom(page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".feeds-container .note-item"));
    return items.map((item) => {
      const anchor =
        item.querySelector('a[href*="/explore/"], a[href*="/discovery/item/"]') ??
        item.querySelector("a.cover");
      const title =
        item.querySelector(".title span")?.textContent?.trim() ??
        item.querySelector(".title")?.textContent?.trim() ??
        item.querySelector('[class*="title"]')?.textContent?.trim() ??
        "";
      const author =
        item.querySelector(".author")?.textContent?.trim() ??
        item.querySelector('[class*="author"]')?.textContent?.trim() ??
        "";
      const cover =
        item.querySelector("img")?.getAttribute("src") ??
        item.querySelector("img")?.getAttribute("data-src") ??
        "";
      return {
        note_id:
          anchor?.href?.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/)?.[1] ?? null,
        xsec_token: anchor?.href ? new URL(anchor.href).searchParams.get("xsec_token") : null,
        title,
        author,
        note_url: anchor?.href ?? null,
        cover_url: cover || null
      };
    });
  });
}

async function fallbackCommentDom(page, limit) {
  return page.evaluate((resolvedLimit) => {
    const textOf = (selector, root) => root.querySelector(selector)?.textContent?.trim() ?? null;
    const comments = Array.from(
      document.querySelectorAll('[class*="comment-item"], [class*="commentItem"], [data-testid="comment-item"]')
    )
      .slice(0, resolvedLimit)
      .map((node) => ({
        comment_id:
          node.getAttribute("data-comment-id") ??
          node.getAttribute("id") ??
          null,
        content:
          textOf('[data-testid="comment-content"]', node) ??
          textOf('[class*="content"]', node) ??
          null,
        author:
          textOf('[data-testid="user-name"]', node) ??
          textOf('[class*="author"]', node) ??
          textOf('[class*="user"]', node) ??
          null,
        like_count:
          textOf('[data-testid="likes-count"]', node) ??
          textOf('[class*="like"]', node) ??
          null,
        reply_count: 0,
        replies: []
      }));
    return comments;
  }, limit);
}

async function findFirstVisibleLocator(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.count()) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function readInteractionState(page, noteIdHint = null) {
  const note = await readNoteRaw(page, noteIdHint);
  const interact = note?.interactInfo ?? {};
  return {
    liked: interact?.liked ?? null,
    collected:
      interact?.collected ??
      interact?.isCollected ??
      interact?.favorited ??
      null,
    like_count: interact?.likedCount ?? interact?.likeCount ?? null,
    collect_count: interact?.collectedCount ?? interact?.collectCount ?? null
  };
}

async function toggleInteraction(page, type, desiredState) {
  const selectorSets = {
    like: [
      ".interact-container .like-wrapper",
      ".engage-bar-style .like-wrapper",
      '[class*="like-wrapper"]'
    ],
    favorite: [
      ".interact-container .collect-wrapper",
      ".engage-bar-style .collect-wrapper",
      '[class*="collect-wrapper"]',
      '[class*="favorite-wrapper"]'
    ]
  };

  const locator = await findFirstVisibleLocator(page, selectorSets[type] ?? []);
  if (!locator) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      `Could not find the ${type} interaction button on the note page.`,
      await captureSnapshot(page)
    );
  }

  await locator.click({ timeout: 10_000 });
  await page.waitForTimeout(1_200);

  return {
    target_state: desiredState
  };
}

async function enterComment(page, content) {
  const activateResult = await page.evaluate(() => {
    const candidates = [
      document.querySelector(".input-box"),
      document.querySelector(".inner-when-not-active"),
      Array.from(document.querySelectorAll("span")).find((node) =>
        (node.textContent || "").trim().includes("说点什么")
      ),
      document.querySelector("#content-textarea"),
      document.querySelector('[contenteditable="true"]')
    ].filter(Boolean);

    for (const candidate of candidates) {
      candidate.click?.();
      candidate.dispatchEvent?.(new MouseEvent("click", { bubbles: true }));
    }

    const editable =
      document.querySelector("#content-textarea") ??
      document.querySelector('[contenteditable="true"]') ??
      document.querySelector('[role="textbox"]');
    if (editable) {
      editable.focus?.();
      return {
        ok: true,
        tag: editable.tagName,
        id: editable.id || null
      };
    }

    return { ok: false };
  });

  if (!activateResult?.ok) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Could not activate the comment editor on the note page.",
      await captureSnapshot(page)
    );
  }

  const editable = await findFirstVisibleLocator(page, [
    "#content-textarea",
    '[contenteditable="true"]',
    '[role="textbox"]',
    "textarea",
    '[class*="comment-input"]'
  ]);

  if (!editable) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Could not find a comment editor on the note page.",
      await captureSnapshot(page)
    );
  }

  try {
    await editable.click({ timeout: 5_000 });
  } catch {
    await page.evaluate(() => {
      const editable =
        document.querySelector("#content-textarea") ??
        document.querySelector('[contenteditable="true"]') ??
        document.querySelector('[role="textbox"]');
      editable?.focus?.();
    });
  }
  try {
    await editable.fill(content);
  } catch {
    await page.keyboard.insertText(content);
  }

  const sendButton = await findFirstVisibleLocator(page, [
    'button:has-text("发送")',
    'button:has-text("发布")',
    '[class*="submit"]',
    '[class*="send"]'
  ]);

  if (sendButton) {
    await sendButton.click({ timeout: 10_000 });
  } else {
    await page.keyboard.press("Enter");
  }

  await page.waitForTimeout(1_000);
}

function parseScheduleDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new XhsFavoritesError(
      ErrorCodes.INVALID_INPUT,
      "schedule_at must be a valid date string or timestamp."
    );
  }

  return date;
}

function isRemoteUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

async function materializeImages(images = []) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xhs-favorites-images-"));
  const localPaths = [];

  try {
    for (let index = 0; index < images.length; index += 1) {
      const value = String(images[index] ?? "").trim();
      if (!value) {
        continue;
      }

      if (!isRemoteUrl(value)) {
        localPaths.push(value);
        continue;
      }

      const response = await fetch(value, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!response.ok) {
        throw new XhsFavoritesError(
          ErrorCodes.INVALID_INPUT,
          `Failed to download remote image: ${value}. HTTP ${response.status}.`
        );
      }

      const contentType = response.headers.get("content-type") || "";
      const extension =
        contentType.includes("png") ? ".png" :
        contentType.includes("webp") ? ".webp" :
        contentType.includes("gif") ? ".gif" :
        ".jpg";
      const filePath = path.join(tempDir, `image-${index + 1}${extension}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      localPaths.push(filePath);
    }

    return {
      local_paths: localPaths,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function ensureCreatorPage(page, url) {
  await ensureAuthenticated(page);
  await gotoAndWait(page, url);
  const snapshot = await captureSnapshot(page);
  if (snapshot.url.includes("/website-login/") || snapshot.body_text.includes("登录")) {
    throw new XhsFavoritesError(
      ErrorCodes.AUTH_STATE_MISMATCH,
      "The XiaoHongShu creator page is not accessible with the current browser session.",
      { page_url: snapshot.url, page_title: snapshot.title }
    );
  }

  if (!page.url().includes("creator.xiaohongshu.com")) {
    throw new XhsFavoritesError(
      ErrorCodes.CREATOR_CENTER_UNAVAILABLE,
      "The creator center did not open correctly in the current browser session.",
      { page_url: page.url(), requested_url: url }
    );
  }
}

async function clickPublishMode(page, tabText) {
  const clicked = await page.evaluate((resolvedTabText) => {
    const tabs = Array.from(document.querySelectorAll("div.creator-tab, [class*='creator-tab']"));
    const matched = tabs.find((tab) => (tab.textContent || "").trim() === resolvedTabText);
    matched?.click();
    return Boolean(matched);
  }, tabText);

  if (!clicked) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      `Could not find the publish tab: ${tabText}`,
      await captureSnapshot(page)
    );
  }

  await page.waitForTimeout(1_000);
}

async function getPublishTitleInput(page) {
  return findFirstVisibleLocator(page, [
    "div.d-input input",
    "input[placeholder*='标题']",
    "input"
  ]);
}

async function getPublishContentEditor(page) {
  const direct = await findFirstVisibleLocator(page, [
    "div.ql-editor",
    '[role="textbox"]',
    "div.editor [contenteditable='true']",
    "p[data-placeholder*='输入正文描述']"
  ]);

  if (direct) {
    return direct;
  }

  return null;
}

async function waitForImageCount(page, expectedCount) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const currentCount = await page.evaluate(() => {
      const previewSelectors = [
        ".img-preview-area .pr",
        ".img-preview-area img",
        "[class*='preview'] img"
      ];
      for (const selector of previewSelectors) {
        const count = document.querySelectorAll(selector).length;
        if (count) {
          return count;
        }
      }
      return 0;
    });

    if (currentCount >= expectedCount) {
      return;
    }
    await page.waitForTimeout(500);
  }

  throw new XhsFavoritesError(
    ErrorCodes.PUBLISH_FLOW_BLOCKED,
    `Timed out while waiting for image ${expectedCount} to finish uploading.`
  );
}

async function waitForPublishButtonClickable(page, { timeoutMs = 10 * 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const button = await findFirstVisibleLocator(page, [
      ".publish-page-publish-btn button.bg-red",
      ".publish-page-publish-btn button",
      "button.bg-red",
      'button:has-text("发布")',
      'button:has-text("立即发布")'
    ]);

    if (button) {
      const disabled = await button.evaluate((node) => {
        return Boolean(
          node.getAttribute("disabled") ||
          node.getAttribute("aria-disabled") === "true" ||
          node.classList.contains("disabled")
        );
      });
      if (!disabled) {
        return button;
      }
    }
    await page.waitForTimeout(1_000);
  }

  throw new XhsFavoritesError(
    ErrorCodes.PUBLISH_FLOW_BLOCKED,
    "Timed out while waiting for the publish button to become clickable."
  );
}

async function uploadImages(page, images) {
  const input = await findFirstVisibleLocator(page, [
    ".upload-input",
    "input[type='file']"
  ]);

  if (!input) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Could not find an image upload input on the publish page.",
      await captureSnapshot(page)
    );
  }

  for (let index = 0; index < images.length; index += 1) {
    await input.setInputFiles(images[index]);
    await waitForImageCount(page, index + 1);
    await page.waitForTimeout(600);
  }
}

async function uploadVideo(page, video) {
  const input = await findFirstVisibleLocator(page, [
    ".upload-input",
    "input[type='file']"
  ]);

  if (!input) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Could not find a video upload input on the publish page.",
      await captureSnapshot(page)
    );
  }

  await input.setInputFiles(video);
  await waitForPublishButtonClickable(page);
}

async function fillPublishTitle(page, title) {
  if (!title?.trim()) {
    throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "title is required for publishing.");
  }

  const titleInput = await getPublishTitleInput(page);
  if (!titleInput) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Could not find the publish title input.",
      await captureSnapshot(page)
    );
  }

  await titleInput.click();
  await titleInput.fill(title.trim());
  await page.waitForTimeout(300);
}

async function fillPublishContent(page, content, tags = [], topics = []) {
  if (!content?.trim()) {
    throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "content is required for publishing.");
  }

  const editor = await getPublishContentEditor(page);
  if (!editor) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Could not find the publish content editor.",
      await captureSnapshot(page)
    );
  }

  await editor.click();
  try {
    await editor.fill(content.trim());
  } catch {
    await page.keyboard.insertText(content.trim());
  }
  await page.waitForTimeout(500);

  const mergedTopics = [...new Set([...(tags || []), ...(topics || [])].filter(Boolean))];
  for (const topic of mergedTopics) {
    await page.keyboard.insertText(`#${String(topic).replace(/^#/, "")}`);
    await page.waitForTimeout(400);

    const suggestion = await findFirstVisibleLocator(page, [
      "#creator-editor-topic-container .item",
      "[class*='topic-container'] .item",
      "[class*='topic'] .item"
    ]);

    if (suggestion) {
      await suggestion.click();
    } else {
      await page.keyboard.insertText(" ");
    }

    await page.waitForTimeout(400);
  }
}

async function setVisibility(page, visibility = "公开可见") {
  if (!visibility || visibility === "公开可见") {
    return;
  }

  const dropdown = await findFirstVisibleLocator(page, [
    "div.permission-card-wrapper div.d-select-content",
    "[class*='permission-card-wrapper'] [class*='d-select-content']"
  ]);

  if (!dropdown) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Could not find the visibility dropdown on the publish page.",
      await captureSnapshot(page)
    );
  }

  await dropdown.click();
  await page.waitForTimeout(500);

  const clicked = await page.evaluate((resolvedVisibility) => {
    const options = Array.from(
      document.querySelectorAll("div.d-options-wrapper div.custom-option, .d-grid-item .custom-option")
    );
    const matched = options.find((option) =>
      (option.textContent || "").includes(resolvedVisibility)
    );
    matched?.click();
    return Boolean(matched);
  }, visibility);

  if (!clicked) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      `Could not find the visibility option: ${visibility}`,
      await captureSnapshot(page)
    );
  }
}

async function setSchedulePublish(page, scheduleAt) {
  const scheduleDate = parseScheduleDate(scheduleAt);
  if (!scheduleDate) {
    return;
  }

  const switcher = await findFirstVisibleLocator(page, [
    ".post-time-wrapper .d-switch",
    "[class*='post-time-wrapper'] .d-switch"
  ]);
  if (!switcher) {
    throw new XhsFavoritesError(
      ErrorCodes.PUBLISH_FLOW_BLOCKED,
      "Could not find the schedule publish switch on the publish page."
    );
  }

  await switcher.click();
  await page.waitForTimeout(700);

  const input = await findFirstVisibleLocator(page, [
    ".date-picker-container input",
    "[class*='date-picker-container'] input"
  ]);
  if (!input) {
    throw new XhsFavoritesError(
      ErrorCodes.PUBLISH_FLOW_BLOCKED,
      "Could not find the schedule datetime input on the publish page."
    );
  }

  const formatted = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, "0")}-${String(scheduleDate.getDate()).padStart(2, "0")} ${String(scheduleDate.getHours()).padStart(2, "0")}:${String(scheduleDate.getMinutes()).padStart(2, "0")}`;
  await input.fill(formatted);
}

async function bindProducts(page, products = []) {
  if (!products?.length) {
    return;
  }

  const addButtonClicked = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span.d-text, span"));
    const matched = spans.find((span) => (span.textContent || "").trim() === "添加商品");
    matched?.closest("button, .d-button, div, span")?.click();
    return Boolean(matched);
  });

  if (!addButtonClicked) {
    throw new XhsFavoritesError(
      ErrorCodes.PUBLISH_FLOW_BLOCKED,
      "Could not find the add product entry. The current account may not support product binding."
    );
  }

  await page.waitForTimeout(1_000);

  for (const product of products) {
    const input = await findFirstVisibleLocator(page, [
      'input[placeholder*="搜索商品ID"]',
      'input[placeholder*="商品名称"]'
    ]);
    if (!input) {
      break;
    }
    await input.fill(String(product));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1_200);

    const checkbox = await findFirstVisibleLocator(page, [
      ".goods-list-normal .good-card-container .d-checkbox",
      ".good-card-container .d-checkbox"
    ]);
    if (checkbox) {
      await checkbox.click();
    }
    await page.waitForTimeout(500);
  }

  const saveButton = await findFirstVisibleLocator(page, [
    ".goods-selected-footer button",
    'button:has-text("保存")',
    'button:has-text("确定")'
  ]);
  if (saveButton) {
    await saveButton.click();
    await page.waitForTimeout(800);
  }
}

async function submitPublish(page) {
  const button = await waitForPublishButtonClickable(page);
  await button.click();
  await page.waitForTimeout(3_000);
}

function summarizePublishResult(page, mode, payload) {
  return {
    provider: "playwright",
    mode,
    status: "submitted",
    page_url: page.url(),
    ...payload
  };
}

async function collectDashboardMetrics(page) {
  return page.evaluate(() => {
    const output = {};
    const walk = document.querySelectorAll("*");
    for (const node of walk) {
      const text = (node.textContent || "").trim();
      if (!text || !/^\d+$/.test(text)) {
        continue;
      }
      const context = (node.parentElement?.textContent || "").trim();
      if (context.includes("观看") || context.includes("浏览")) output.views = Number(text);
      if (context.includes("点赞")) output.likes = Number(text);
      if (context.includes("收藏")) output.collects = Number(text);
      if (context.includes("评论")) output.comments = Number(text);
      if (context.includes("分享")) output.shares = Number(text);
      if (context.includes("互动")) output.interactions = Number(text);
    }
    return output;
  });
}

async function switchCreatorDimension(page, targetText) {
  const clicked = await page.evaluate((resolvedTarget) => {
    const candidates = Array.from(document.querySelectorAll("button, div, span"));
    const trigger = candidates.find((element) => (element.textContent || "").includes("近7天"));
    trigger?.click();
    const target = candidates.find((element) => (element.textContent || "").includes(resolvedTarget));
    target?.click();
    return Boolean(target);
  }, targetText);

  if (clicked) {
    await page.waitForTimeout(2_000);
  }
  return clicked;
}

async function collectContentMetrics(page, limit = 30) {
  return page.evaluate((resolvedLimit) => {
    const rows = Array.from(document.querySelectorAll(".note-data-table tr, .el-table__row, tr"));
    const headerKeywords = ["笔记基础信息", "观看", "点赞", "评论", "收藏", "涨粉", "分享", "操作"];
    return rows
      .map((row) => {
        const text = (row.textContent || "").trim();
        if (!text) return null;
        if (headerKeywords.some((keyword) => text.includes(keyword))) return null;
        const cells = Array.from(row.querySelectorAll(".el-table__cell, td, th, [class*='cell']"))
          .map((cell) => (cell.textContent || "").trim())
          .filter(Boolean);
        if (cells.length < 3) return null;
        return {
          title: cells[0]?.split("发布于")[0]?.trim() || null,
          publish_time: cells[1] || null,
          views: cells[2] || null,
          likes: cells[3] || null,
          comments: cells[4] || null,
          collects: cells[5] || null,
          fans_growth: cells[6] || null,
          shares: cells[7] || null
        };
      })
      .filter(Boolean)
      .slice(0, resolvedLimit);
  }, limit);
}

async function collectFanMetrics(page) {
  return page.evaluate(() => {
    const mapping = [
      ["总粉丝数", "total_fans"],
      ["新增粉丝数", "new_fans"],
      ["流失粉丝数", "lost_fans"]
    ];
    const output = {};
    for (const [label, key] of mapping) {
      const elements = Array.from(document.querySelectorAll("*")).filter((node) =>
        (node.textContent || "").includes(label)
      );
      for (const element of elements) {
        const parentText = (element.parentElement?.textContent || "").trim();
        const match = parentText.match(/(\d+)/);
        if (match) {
          output[key] = Number(match[1]);
          break;
        }
      }
    }
    return output;
  });
}

export const playwrightProvider = {
  name: "playwright",

  async getCapabilities() {
    return {
      provider: "playwright",
      list_home_feed: true,
      search_notes: true,
      get_note_detail: true,
      get_note_comments: true,
      list_user_notes: true,
      list_saved_notes: true,
      list_saved_boards: true,
      list_board_items: true,
      like_note: true,
      favorite_note: true,
      post_comment: true,
      reply_comment: true,
      publish_note: true,
      publish_video: true,
      creator_dashboard: true,
      creator_content_metrics: true,
      creator_fan_metrics: true
    };
  },

  async doctor({ headless = false, channel = DEFAULT_CHANNEL } = {}) {
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
        provider: "playwright",
        profile_dir_exists: diagnosis.profile_dir_exists,
        login_state: diagnosis.login_state,
        page_url: diagnosis.url,
        page_title: diagnosis.title,
        profile_id: profileId
      };
    });
  },

  async login({ channel = DEFAULT_CHANNEL, target = "main" } = {}) {
    await openLoginBrowser({ channel, url: resolveLoginUrl(target) });
    return this.doctor({ headless: false, channel });
  },

  async listSavedNotes({
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
      const diagnosis = await ensureNotBlocked(page, "Risk control page detected on favorites notes page.");

      const collected = await collectFeedItems(
        page,
        readSavedNotesRaw,
        normalizeSavedNotes,
        resolvedLimit,
        resolvedScroll
      );

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
        provider: "playwright",
        profile_id: profileId,
        items: trimItems(collected.items, resolvedLimit),
        next_cursor: collected.next_cursor,
        has_more: Boolean(collected.has_more)
      };
    });
  },

  async listSavedBoards({
    limit = DEFAULT_LIMIT,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    const resolvedLimit = requireLimit(limit);

    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureAuthenticated(page);
      const profileId = await resolveCurrentProfileId(page);
      await gotoAndWait(page, `https://www.xiaohongshu.com/user/profile/${profileId}?tab=fav&subTab=board`);
      const diagnosis = await ensureNotBlocked(page, "Risk control page detected on favorites boards page.");
      const boards = normalizeBoards(await readBoardsRaw(page));

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
        provider: "playwright",
        profile_id: profileId,
        items: trimItems(boards, resolvedLimit)
      };
    });
  },

  async listBoardItems({
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
      const diagnosis = await ensureNotBlocked(page, "Risk control page detected on board page.");
      const collected = await collectFeedItems(
        page,
        (currentPage) => readBoardFeedEntryRaw(currentPage, resolvedBoardId),
        (raw) => normalizeBoardFeedEntry(raw, resolvedBoardId),
        resolvedLimit,
        resolvedScroll
      );

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
        provider: "playwright",
        board_id: resolvedBoardId,
        board_url: buildBoardUrl(resolvedBoardId),
        items: trimItems(collected.items, resolvedLimit),
        next_cursor: collected.next_cursor,
        has_more: Boolean(collected.has_more)
      };
    });
  },

  async getNoteDetail({
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
      await gotoAndWait(page, noteUrl);
      await ensureNotBlocked(page, "Risk control page detected on note detail page.");
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

      return {
        ...normalized,
        provider: "playwright"
      };
    });
  },

  async listHomeFeed({
    limit = DEFAULT_LIMIT,
    scroll = DEFAULT_SCROLL_ITERATIONS,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    const resolvedLimit = requireLimit(limit);
    const resolvedScroll = requireScroll(scroll);

    return withPersistentSession({ headless, channel }, async (page) => {
      await gotoAndWait(page, XHS_EXPLORE_URL);
      await ensureNotBlocked(page, "Risk control page detected on the home feed page.");
      const collected = await collectFeedItems(
        page,
        readHomeFeedRaw,
        normalizeSavedNotes,
        resolvedLimit,
        resolvedScroll
      );

      if (collected === null) {
        throw new XhsFavoritesError(
          ErrorCodes.SELECTOR_CHANGED,
          "Could not find the home feed state inside __INITIAL_STATE__.",
          await captureSnapshot(page)
        );
      }

      return {
        source: "home_feed",
        provider: "playwright",
        items: trimItems(collected.items, resolvedLimit),
        next_cursor: collected.next_cursor,
        has_more: Boolean(collected.has_more)
      };
    });
  },

  async searchNotes({
    keyword,
    limit = DEFAULT_LIMIT,
    scroll = DEFAULT_SCROLL_ITERATIONS,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    if (!keyword?.trim()) {
      throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "keyword is required for search-notes.");
    }

    const resolvedLimit = requireLimit(limit);
    const resolvedScroll = requireScroll(scroll);
    const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`;

    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureAuthenticated(page);
      await gotoAndWait(page, searchUrl);
      await ensureNotBlocked(page, "Risk control page detected on the search page.");

      let collected = await collectFeedItems(
        page,
        readSearchFeedRaw,
        normalizeSavedNotes,
        resolvedLimit,
        resolvedScroll
      );

      if (collected === null || !collected.items.length) {
        const domItems = await fallbackSearchDom(page);
        collected = {
          items: Array.isArray(domItems) ? domItems.filter((item) => item?.note_id && item?.note_url) : [],
          next_cursor: null,
          has_more: false
        };
      }

      return {
        source: "search_notes",
        provider: "playwright",
        keyword,
        items: trimItems(collected.items, resolvedLimit),
        next_cursor: collected.next_cursor,
        has_more: Boolean(collected.has_more)
      };
    });
  },

  async listUserNotes({
    profileId = null,
    url = null,
    limit = DEFAULT_LIMIT,
    scroll = DEFAULT_SCROLL_ITERATIONS,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    const resolvedLimit = requireLimit(limit);
    const resolvedScroll = requireScroll(scroll);

    let targetUrl = url;
    if (!targetUrl) {
      if (!profileId?.trim()) {
        throw new XhsFavoritesError(
          ErrorCodes.INVALID_INPUT,
          "Provide --profile-id or --url for list-user-notes."
        );
      }
      targetUrl = `https://www.xiaohongshu.com/user/profile/${profileId.trim()}`;
    }

    return withPersistentSession({ headless, channel }, async (page) => {
      await gotoAndWait(page, targetUrl);
      await ensureNotBlocked(page, "Risk control page detected on the user profile page.");
      const resolvedProfileId = profileId?.trim() || extractProfileIdFromHref(targetUrl) || null;

      let collected = await collectFeedItems(
        page,
        readUserNotesRaw,
        normalizeSavedNotes,
        resolvedLimit,
        resolvedScroll
      );

      if (collected === null || !collected.items.length) {
        const domItems = await fallbackSearchDom(page);
        collected = {
          items: Array.isArray(domItems) ? domItems.filter((item) => item?.note_id && item?.note_url) : [],
          next_cursor: null,
          has_more: false
        };
      }

      return {
        source: "user_notes",
        provider: "playwright",
        profile_id: resolvedProfileId,
        items: trimItems(collected.items, resolvedLimit),
        next_cursor: collected.next_cursor,
        has_more: Boolean(collected.has_more)
      };
    });
  },

  async getNoteComments({
    url = null,
    noteId = null,
    xsecToken = null,
    limit = DEFAULT_LIMIT,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    const resolvedLimit = requireLimit(limit);
    let noteUrl = url;
    if (!noteUrl) {
      if (!noteId?.trim()) {
        throw new XhsFavoritesError(
          ErrorCodes.INVALID_INPUT,
          "Provide --url or --note-id for get-note-comments."
        );
      }
      noteUrl = buildNoteUrl(noteId.trim(), xsecToken?.trim() || null);
    }

    const noteIdHint = parseNoteIdFromUrl(noteUrl) || noteId || null;

    return withPersistentSession({ headless, channel }, async (page) => {
      await gotoAndWait(page, noteUrl);
      await ensureNotBlocked(page, "Risk control page detected on the note comment page.");

      let commentState = await readNoteCommentState(page, noteIdHint);
      let items = normalizeCommentList(commentState?.list ?? [], { limit: resolvedLimit });

      if (!items.length) {
        await scrollPage(page);
        commentState = await readNoteCommentState(page, noteIdHint);
        items = normalizeCommentList(commentState?.list ?? [], { limit: resolvedLimit });
      }

      if (!items.length) {
        const domItems = await fallbackCommentDom(page, resolvedLimit);
        items = Array.isArray(domItems) ? domItems : [];
      }

      return {
        source: "note_comments",
        provider: "playwright",
        items,
        next_cursor: commentState?.cursor ?? null,
        has_more: Boolean(commentState?.hasMore)
      };
    });
  },

  async likeNote({
    url = null,
    noteId = null,
    xsecToken = null,
    unlike = false,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    let noteUrl = url;
    if (!noteUrl) {
      if (!noteId?.trim()) {
        throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "Provide --url or --note-id for like-note.");
      }
      noteUrl = buildNoteUrl(noteId.trim(), xsecToken?.trim() || null);
    }

    const desiredState = !unlike;
    const noteIdHint = parseNoteIdFromUrl(noteUrl) || noteId || null;

    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureAuthenticated(page);
      await gotoAndWait(page, noteUrl);
      await ensureNotBlocked(page, "Risk control page detected on the note page.");
      const before = await readInteractionState(page, noteIdHint);
      if (before.liked === desiredState) {
        return {
          provider: "playwright",
          note_url: noteUrl,
          liked: before.liked,
          changed: false
        };
      }

      await toggleInteraction(page, "like", desiredState);
      const after = await readInteractionState(page, noteIdHint);
      return {
        provider: "playwright",
        note_url: noteUrl,
        liked: after.liked,
        changed: before.liked !== after.liked,
        like_count: after.like_count
      };
    });
  },

  async favoriteNote({
    url = null,
    noteId = null,
    xsecToken = null,
    unfavorite = false,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    let noteUrl = url;
    if (!noteUrl) {
      if (!noteId?.trim()) {
        throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "Provide --url or --note-id for favorite-note.");
      }
      noteUrl = buildNoteUrl(noteId.trim(), xsecToken?.trim() || null);
    }

    const desiredState = !unfavorite;
    const noteIdHint = parseNoteIdFromUrl(noteUrl) || noteId || null;

    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureAuthenticated(page);
      await gotoAndWait(page, noteUrl);
      await ensureNotBlocked(page, "Risk control page detected on the note page.");
      const before = await readInteractionState(page, noteIdHint);
      if (before.collected === desiredState) {
        return {
          provider: "playwright",
          note_url: noteUrl,
          favorited: before.collected,
          changed: false
        };
      }

      await toggleInteraction(page, "favorite", desiredState);
      const after = await readInteractionState(page, noteIdHint);
      return {
        provider: "playwright",
        note_url: noteUrl,
        favorited: after.collected,
        changed: before.collected !== after.collected,
        collect_count: after.collect_count
      };
    });
  },

  async postComment({
    url = null,
    noteId = null,
    xsecToken = null,
    content,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    if (!content?.trim()) {
      throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "content is required for post-comment.");
    }

    let noteUrl = url;
    if (!noteUrl) {
      if (!noteId?.trim()) {
        throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "Provide --url or --note-id for post-comment.");
      }
      noteUrl = buildNoteUrl(noteId.trim(), xsecToken?.trim() || null);
    }

    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureAuthenticated(page);
      await gotoAndWait(page, noteUrl);
      await ensureNotBlocked(page, "Risk control page detected on the note page.");
      await enterComment(page, content.trim());
      return {
        provider: "playwright",
        note_url: noteUrl,
        status: "submitted"
      };
    });
  },

  async replyComment({
    url = null,
    noteId = null,
    xsecToken = null,
    commentId = null,
    userId = null,
    content,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    if (!content?.trim()) {
      throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "content is required for reply-comment.");
    }

    let noteUrl = url;
    if (!noteUrl) {
      if (!noteId?.trim()) {
        throw new XhsFavoritesError(ErrorCodes.INVALID_INPUT, "Provide --url or --note-id for reply-comment.");
      }
      noteUrl = buildNoteUrl(noteId.trim(), xsecToken?.trim() || null);
    }

    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureAuthenticated(page);
      await gotoAndWait(page, noteUrl);
      await ensureNotBlocked(page, "Risk control page detected on the note page.");

      const replyClicked = await page.evaluate(({ targetCommentId, targetUserId }) => {
        const candidates = Array.from(
          document.querySelectorAll('[class*="comment-item"], [class*="commentItem"], [data-testid="comment-item"]')
        );
        const matched = candidates.find((node) => {
          const nodeCommentId = node.getAttribute("data-comment-id") || node.getAttribute("id");
          const normalizedNodeCommentId = nodeCommentId?.replace(/^comment-/, "") || null;
          if (targetCommentId && normalizedNodeCommentId === targetCommentId) {
            return true;
          }
          if (targetUserId) {
            const userId =
              node.getAttribute("data-user-id") ||
              node.querySelector("[data-user-id]")?.getAttribute("data-user-id");
            if (userId === targetUserId) {
              return true;
            }
          }
          return false;
        });
        if (!matched) {
          return false;
        }
        const button = Array.from(matched.querySelectorAll("button, span, div")).find((node) =>
          (node.textContent || "").trim().includes("回复")
        );
        button?.click();
        return Boolean(button);
      }, { targetCommentId: commentId, targetUserId: userId });

      if (!replyClicked) {
        throw new XhsFavoritesError(
          ErrorCodes.SELECTOR_CHANGED,
          "Could not locate the target comment reply entry.",
          { page_url: noteUrl, comment_id: commentId, user_id: userId }
        );
      }

      await page.waitForTimeout(500);
      await enterComment(page, content.trim());
      return {
        provider: "playwright",
        note_url: noteUrl,
        comment_id: commentId,
        user_id: userId,
        status: "submitted"
      };
    });
  },

  async publishNote({
    title,
    content,
    images = [],
    tags = [],
    topics = [],
    scheduleAt = null,
    visibility = "公开可见",
    products = [],
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    if (!Array.isArray(images) || !images.length) {
      throw new XhsFavoritesError(
        ErrorCodes.INVALID_INPUT,
        "publish-note requires at least one image."
      );
    }

    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureCreatorPage(page, XHS_CREATOR_PUBLISH_URL);
      await clickPublishMode(page, "上传图文");
      const materialized = await materializeImages(images);
      try {
        await uploadImages(page, materialized.local_paths);
        await fillPublishTitle(page, title);
        await fillPublishContent(page, content, tags, topics);
        await setSchedulePublish(page, scheduleAt);
        await setVisibility(page, visibility);
        await bindProducts(page, products);
        await submitPublish(page);
        return summarizePublishResult(page, "image_note", {
          title,
          image_count: images.length,
          scheduled_for: scheduleAt ?? null,
          visibility
        });
      } finally {
        await materialized.cleanup();
      }
    });
  },

  async publishVideo({
    title,
    content,
    video,
    tags = [],
    topics = [],
    scheduleAt = null,
    visibility = "公开可见",
    products = [],
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    if (!video?.trim()) {
      throw new XhsFavoritesError(
        ErrorCodes.INVALID_INPUT,
        "publish-video requires a local video path."
      );
    }

    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureCreatorPage(page, XHS_CREATOR_PUBLISH_URL);
      await clickPublishMode(page, "上传视频");
      await uploadVideo(page, video.trim());
      await fillPublishTitle(page, title);
      await fillPublishContent(page, content, tags, topics);
      await setSchedulePublish(page, scheduleAt);
      await setVisibility(page, visibility);
      await bindProducts(page, products);
      await submitPublish(page);
      return summarizePublishResult(page, "video_note", {
        title,
        video,
        scheduled_for: scheduleAt ?? null,
        visibility
      });
    });
  },

  async getCreatorDashboard({
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureCreatorPage(page, XHS_CREATOR_DASHBOARD_URL);
      const sevenDay = await collectDashboardMetrics(page);
      let thirtyDay = null;
      if (await switchCreatorDimension(page, "近30天")) {
        thirtyDay = await collectDashboardMetrics(page);
      }

      return {
        provider: "playwright",
        source: "creator_dashboard",
        dimensions: [
          { dimension: "7天", ...sevenDay },
          ...(thirtyDay ? [{ dimension: "30天", ...thirtyDay }] : [])
        ]
      };
    });
  },

  async getCreatorContentMetrics({
    limit = DEFAULT_LIMIT,
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    const resolvedLimit = requireLimit(limit);
    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureCreatorPage(page, XHS_CREATOR_CONTENT_URL);
      const items = await collectContentMetrics(page, resolvedLimit);
      return {
        provider: "playwright",
        source: "creator_content_metrics",
        items
      };
    });
  },

  async getCreatorFanMetrics({
    headless = false,
    channel = DEFAULT_CHANNEL
  } = {}) {
    return withPersistentSession({ headless, channel }, async (page) => {
      await ensureCreatorPage(page, XHS_CREATOR_FANS_URL);
      const sevenDay = await collectFanMetrics(page);
      let thirtyDay = null;
      if (await switchCreatorDimension(page, "近30天")) {
        thirtyDay = await collectFanMetrics(page);
      }
      return {
        provider: "playwright",
        source: "creator_fan_metrics",
        dimensions: [
          { dimension: "7天", ...sevenDay },
          ...(thirtyDay ? [{ dimension: "30天", ...thirtyDay }] : [])
        ]
      };
    });
  }
};
