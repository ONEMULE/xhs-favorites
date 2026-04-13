export const ErrorCodes = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  RISK_CONTROLLED: "RISK_CONTROLLED",
  EMPTY_STATE: "EMPTY_STATE",
  SELECTOR_CHANGED: "SELECTOR_CHANGED",
  NAVIGATION_TIMEOUT: "NAVIGATION_TIMEOUT",
  INVALID_INPUT: "INVALID_INPUT",
  UNKNOWN: "UNKNOWN"
});

export class XhsFavoritesError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = "XhsFavoritesError";
    this.code = code;
    this.meta = meta;
  }
}

export function isXhsFavoritesError(error) {
  return error instanceof XhsFavoritesError;
}

export function toErrorPayload(error) {
  if (isXhsFavoritesError(error)) {
    return {
      error_code: error.code,
      message: error.message,
      ...error.meta
    };
  }

  return {
    error_code: ErrorCodes.UNKNOWN,
    message: error instanceof Error ? error.message : String(error)
  };
}

export function exitCodeForError(error) {
  const code = isXhsFavoritesError(error) ? error.code : ErrorCodes.UNKNOWN;
  switch (code) {
    case ErrorCodes.AUTH_REQUIRED:
      return 21;
    case ErrorCodes.RISK_CONTROLLED:
      return 22;
    case ErrorCodes.EMPTY_STATE:
      return 23;
    case ErrorCodes.SELECTOR_CHANGED:
      return 24;
    case ErrorCodes.NAVIGATION_TIMEOUT:
      return 25;
    case ErrorCodes.INVALID_INPUT:
      return 26;
    default:
      return 1;
  }
}
