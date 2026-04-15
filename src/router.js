import { apiProvider } from "./providers/api-provider.js";
import { playwrightProvider } from "./providers/playwright-provider.js";
import { ErrorCodes, XhsFavoritesError } from "./errors.js";

const ROUTES = {
  login: ["playwright"],
  doctor: ["playwright"],
  doctor_full: ["api", "playwright"],
  list_saved_notes: ["playwright"],
  list_saved_boards: ["playwright"],
  list_board_items: ["playwright"],
  get_saved_note_detail: ["api", "playwright"],
  get_note_detail: ["api", "playwright"],
  list_home_feed: ["api", "playwright"],
  search_notes: ["api", "playwright"],
  get_note_comments: ["playwright", "api"],
  list_user_notes: ["api", "playwright"],
  like_note: ["playwright"],
  favorite_note: ["playwright"],
  post_comment: ["playwright"],
  reply_comment: ["playwright"],
  publish_note: ["playwright"],
  publish_video: ["playwright"],
  get_creator_dashboard: ["playwright"],
  get_creator_content_metrics: ["playwright"],
  get_creator_fan_metrics: ["playwright"]
};

const PROVIDERS = {
  api: apiProvider,
  playwright: playwrightProvider
};

const METHOD_MAP = {
  login: "login",
  doctor: "doctor",
  doctor_full: "getCapabilities",
  list_saved_notes: "listSavedNotes",
  list_saved_boards: "listSavedBoards",
  list_board_items: "listBoardItems",
  get_saved_note_detail: "getNoteDetail",
  get_note_detail: "getNoteDetail",
  list_home_feed: "listHomeFeed",
  search_notes: "searchNotes",
  get_note_comments: "getNoteComments",
  list_user_notes: "listUserNotes",
  like_note: "likeNote",
  favorite_note: "favoriteNote",
  post_comment: "postComment",
  reply_comment: "replyComment",
  publish_note: "publishNote",
  publish_video: "publishVideo",
  get_creator_dashboard: "getCreatorDashboard",
  get_creator_content_metrics: "getCreatorContentMetrics",
  get_creator_fan_metrics: "getCreatorFanMetrics"
};

export async function routeOperation(operation, args = {}) {
  const route = ROUTES[operation];
  const method = METHOD_MAP[operation];

  if (!route || !method) {
    throw new XhsFavoritesError(
      ErrorCodes.INVALID_INPUT,
      `Unknown routed operation: ${operation}`
    );
  }

  if (operation === "doctor_full") {
    const [apiCaps, browserCaps, doctorResult] = await Promise.all([
      apiProvider.getCapabilities(),
      playwrightProvider.getCapabilities(),
      playwrightProvider.doctor(args)
    ]);

    return {
      ...doctorResult,
      capabilities: {
        api: apiCaps,
        playwright: browserCaps
      }
    };
  }

  const errors = [];
  for (const providerName of route) {
    const provider = PROVIDERS[providerName];
    if (!provider || typeof provider[method] !== "function") {
      continue;
    }

    try {
      return await provider[method](args);
    } catch (error) {
      if (
        error instanceof XhsFavoritesError &&
        error.code === ErrorCodes.CAPABILITY_UNAVAILABLE
      ) {
        errors.push({ provider: providerName, message: error.message });
        continue;
      }

      throw error;
    }
  }

  throw new XhsFavoritesError(
    ErrorCodes.CAPABILITY_UNAVAILABLE,
    `No available provider could handle operation ${operation}.`,
    { providers_tried: errors }
  );
}
