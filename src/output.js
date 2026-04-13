import { exitCodeForError, toErrorPayload } from "./errors.js";

export function printJson(payload, { pretty = false, stream = process.stdout } = {}) {
  stream.write(`${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`);
}

export function printError(error, { pretty = false } = {}) {
  const payload = toErrorPayload(error);
  printJson(payload, { pretty, stream: process.stderr });
  return exitCodeForError(error);
}
