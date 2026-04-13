import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium, errors as playwrightErrors } from "playwright";
import {
  DEFAULT_CHANNEL,
  DEFAULT_NETWORK_IDLE_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  PROFILE_DIR,
  USER_AGENT,
  XHS_EXPLORE_URL,
  ensureRuntimeDirs
} from "./constants.js";
import { classifySnapshot, extractProfileIdFromHref } from "./extractors.js";
import { ErrorCodes, XhsFavoritesError } from "./errors.js";

export async function launchPersistentSession({
  headless = false,
  channel = DEFAULT_CHANNEL,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  ensureRuntimeDirs();

  const launch = async (resolvedChannel) => {
    const options = {
      headless,
      locale: "zh-CN",
      userAgent: USER_AGENT,
      viewport: { width: 1440, height: 960 }
    };

    if (resolvedChannel) {
      options.channel = resolvedChannel;
    }

    return chromium.launchPersistentContext(PROFILE_DIR, options);
  };

  let context;
  try {
    context = await launch(channel);
  } catch (error) {
    if (channel) {
      context = await launch("");
    } else {
      throw error;
    }
  }

  context.setDefaultTimeout(timeoutMs);
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export function profileExists() {
  return fs.existsSync(PROFILE_DIR);
}

export async function gotoAndWait(page, url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });
  } catch (error) {
    if (error instanceof playwrightErrors.TimeoutError) {
      throw new XhsFavoritesError(ErrorCodes.NAVIGATION_TIMEOUT, `Timed out while opening ${url}`, {
        page_url: url
      });
    }

    throw error;
  }

  await waitForNetworkIdle(page);
}

export async function waitForNetworkIdle(page, timeoutMs = DEFAULT_NETWORK_IDLE_TIMEOUT_MS) {
  try {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  } catch (error) {
    if (!(error instanceof playwrightErrors.TimeoutError)) {
      throw error;
    }
  }
}

export async function captureSnapshot(page) {
  return page.evaluate(() => ({
    title: document.title ?? "",
    url: window.location.href,
    body_text: (document.body?.innerText ?? "").slice(0, 2000),
    has_login_container: Boolean(document.querySelector(".login-container")),
    has_profile_link: Boolean(document.querySelector('a[href*="/user/profile/"]')),
    sidebar_text:
      document.querySelector(".user.side-bar-component .channel")?.textContent?.trim() ?? ""
  }));
}

export async function ensureAuthenticated(page) {
  await gotoAndWait(page, XHS_EXPLORE_URL);
  const snapshot = await captureSnapshot(page);
  const state = classifySnapshot(snapshot);

  if (state === "risk_controlled") {
    throw new XhsFavoritesError(
      ErrorCodes.RISK_CONTROLLED,
      "XiaoHongShu returned a risk control page. Switch to a safer network or refresh the dedicated profile.",
      {
        page_url: snapshot.url,
        page_title: snapshot.title
      }
    );
  }

  if (state === "auth_required") {
    throw new XhsFavoritesError(
      ErrorCodes.AUTH_REQUIRED,
      "No valid XiaoHongShu login session was found in the dedicated Playwright profile.",
      {
        page_url: snapshot.url,
        page_title: snapshot.title
      }
    );
  }

  return {
    login_state: state,
    ...snapshot
  };
}

export async function resolveCurrentProfileId(page) {
  const fromUrl = extractProfileIdFromHref(page.url());
  if (fromUrl) {
    return fromUrl;
  }

  const discovered = await page.evaluate(() => {
    const directHref =
      document.querySelector('header a[href^="/user/profile/"]')?.getAttribute("href") ??
      document.querySelector('a[href*="/user/profile/"]')?.getAttribute("href");

    if (directHref) {
      return directHref;
    }

    const state = globalThis.__INITIAL_STATE__;
    if (!state) {
      return null;
    }

    try {
      const raw = JSON.stringify(state);
      const match = raw.match(/\/user\/profile\/([^\\\"?#/]+)/);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  });

  const directId = extractProfileIdFromHref(discovered);
  if (directId) {
    return directId;
  }

  await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("a,button,div,span")).filter(
      (element) => (element.textContent || "").trim() === "我"
    );
    candidates[0]?.click();
  });
  await waitForNetworkIdle(page);

  const clickedId = extractProfileIdFromHref(page.url());
  if (clickedId) {
    return clickedId;
  }

  throw new XhsFavoritesError(
    ErrorCodes.SELECTOR_CHANGED,
    "Could not resolve the current XiaoHongShu profile id from the authenticated session.",
    await captureSnapshot(page)
  );
}

export function buildFavoritesUrl(profileId, subTab) {
  return `https://www.xiaohongshu.com/user/profile/${profileId}?tab=fav&subTab=${subTab}`;
}

export async function openLoginBrowser({ channel = DEFAULT_CHANNEL, url = XHS_EXPLORE_URL } = {}) {
  ensureRuntimeDirs();

  const args = ["-y", "playwright", "open", "--user-data-dir", PROFILE_DIR];
  if (channel) {
    args.push("--channel", channel);
  }
  args.push(url);

  const result = spawnSync("npx", args, {
    stdio: "inherit"
  });

  if (result.error) {
    throw new XhsFavoritesError(ErrorCodes.UNKNOWN, result.error.message);
  }

  if (result.status !== 0) {
    throw new XhsFavoritesError(
      ErrorCodes.UNKNOWN,
      `playwright open exited with status ${result.status}.`
    );
  }
}
