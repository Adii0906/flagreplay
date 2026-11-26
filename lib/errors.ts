export type AppErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "network"
  | "bad_response"
  | "server"
  | "validation"
  | "not_configured"
  | "conflict"
  | "recovery_unavailable"
  | "llm_error";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public status = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class FlagsmithApiError extends AppError {
  constructor(
    code: AppErrorCode,
    message: string,
    public httpStatus: number | null,
    public path: string,
  ) {
    super(code, message, httpStatus && httpStatus >= 400 && httpStatus < 600 ? 502 : 502);
    this.name = "FlagsmithApiError";
  }
}

export function toErrorBody(err: unknown): { error: { code: string; message: string; details?: unknown } } {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message, details: err.details } };
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return { error: { code: "server", message } };
}

export function errorStatus(err: unknown): number {
  if (err instanceof FlagsmithApiError) return 502;
  if (err instanceof AppError) return err.status;
  return 500;
}

export function jsonError(err: unknown): Response {
  if (!(err instanceof AppError)) console.error("[flagreplay]", err);
  return Response.json(toErrorBody(err), { status: errorStatus(err) });
}
