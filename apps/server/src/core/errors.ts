import { Elysia } from "elysia";

/**
 * Every expected failure is an AppError with a stable code. The error plugin turns it
 * into `{ error: { code, message, retryable } }` (contracts `apiErrorSchema`).
 */
const CODES = {
  UNAUTHORIZED: { status: 401, message: "Sign in first.", retryable: false },
  FORBIDDEN: { status: 403, message: "That isn't yours.", retryable: false },
  NOT_FOUND: { status: 404, message: "Not found.", retryable: false },
  BAD_REQUEST: { status: 400, message: "That request isn't valid.", retryable: false },
  NOT_IMPLEMENTED: { status: 501, message: "Not built yet.", retryable: false },
  LLM_UNAVAILABLE: { status: 503, message: "The language model isn't configured.", retryable: false },
  LLM_FAILED: { status: 502, message: "The language model didn't answer. Try again.", retryable: true },
  VOICE_UNAVAILABLE: { status: 503, message: "Voice isn't configured.", retryable: false },
  VOICE_FAILED: { status: 502, message: "Couldn't synthesise that line. Try again.", retryable: true },
  TRANSCRIPTION_FAILED: { status: 502, message: "Transcription failed. Try again.", retryable: true },
} as const;
export type ErrorCode = keyof typeof CODES;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ErrorCode, opts: { message?: string; cause?: unknown } = {}) {
    const def = CODES[code];
    super(opts.message ?? def.message, { cause: opts.cause });
    this.code = code;
    this.status = def.status;
    this.retryable = def.retryable;
  }

  toBody() {
    return { error: { code: this.code, message: this.message, retryable: this.retryable } };
  }
}

/**
 * Error mapping. NOTE: never add a catch-all `GET /*` route anywhere in this app.
 * It silently swallows `/api/auth/*` (elysia#1515).
 */
export const errorPlugin = new Elysia({ name: "errors" }).onError({ as: "global" }, ({ error, code, set }) => {
  if (error instanceof AppError) {
    if (error.cause) console.error(`[${error.code}]`, error.cause);
    set.status = error.status;
    return error.toBody();
  }
  if (code === "VALIDATION") {
    set.status = 400;
    return { error: { code: "BAD_REQUEST", message: error.message, retryable: false } };
  }
  if (code === "NOT_FOUND") {
    set.status = 404;
    return { error: { code: "NOT_FOUND", message: "No such route.", retryable: false } };
  }
  console.error(error);
  set.status = 500;
  return { error: { code: "INTERNAL", message: "Something went wrong.", retryable: true } };
});
