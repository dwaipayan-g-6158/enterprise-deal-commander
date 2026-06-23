import type { Response } from "express";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  patternCodes?: string[];
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Forbidden") =>
  new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Resource not found") =>
  new HttpError(404, "NOT_FOUND", message);
export const conflict = (message: string) =>
  new HttpError(409, "CONFLICT", message);
export const stageGuardrail = (message: string, patternCodes: string[]) => {
  const err = new HttpError(409, "STAGE_GUARDRAIL", message);
  err.patternCodes = patternCodes;
  return err;
};

export function sendError(res: Response, err: HttpError): void {
  res.status(err.status).json({
    error: {
      code: err.code,
      message: err.message,
      details: err.details,
      ...(err.patternCodes ? { patternCodes: err.patternCodes } : {}),
    },
  });
}
