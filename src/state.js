import vm from "node:vm";
import { XHS_HOST } from "./constants.js";
import { ErrorCodes, XhsFavoritesError } from "./errors.js";

const INITIAL_STATE_MARKER = "window.__INITIAL_STATE__=";

export function extractInitialStateLiteral(html) {
  const start = html.indexOf(INITIAL_STATE_MARKER);
  if (start === -1) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Could not find window.__INITIAL_STATE__ in the HTML document."
    );
  }

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  let begun = false;

  for (let index = start + INITIAL_STATE_MARKER.length; index < html.length; index += 1) {
    const character = html[index];

    if (!begun) {
      if (character === "{") {
        begun = true;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === quote) {
        inString = false;
        quote = "";
      }

      continue;
    }

    if (character === "\"" || character === "'") {
      inString = true;
      quote = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start + INITIAL_STATE_MARKER.length, index + 1);
      }
    }
  }

  throw new XhsFavoritesError(
    ErrorCodes.SELECTOR_CHANGED,
    "Could not extract a complete __INITIAL_STATE__ object literal from the HTML document."
  );
}

export function parseInitialStateLiteral(literal) {
  try {
    return vm.runInNewContext(`(${literal})`, { undefined: null });
  } catch (error) {
    throw new XhsFavoritesError(
      ErrorCodes.SELECTOR_CHANGED,
      "Failed to evaluate the extracted __INITIAL_STATE__ object literal.",
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

export function parseInitialStateFromHtml(html) {
  return parseInitialStateLiteral(extractInitialStateLiteral(html));
}

export async function fetchPageHtml(url, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      referer: XHS_HOST,
      ...extraHeaders
    }
  });

  if (!response.ok) {
    throw new XhsFavoritesError(
      ErrorCodes.UNKNOWN,
      `Failed to fetch ${url}. HTTP ${response.status}.`,
      { page_url: url, status: response.status }
    );
  }

  return await response.text();
}

export async function fetchInitialState(url, extraHeaders = {}) {
  const html = await fetchPageHtml(url, extraHeaders);
  return parseInitialStateFromHtml(html);
}
