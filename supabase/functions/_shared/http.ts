import { errorEnvelope, statusFor, type ErrorCode, type ErrorOptions } from './errors.ts';
import type { PipelineOutcome } from './pipeline.ts';

/**
 * HTTP plumbing shared by every function entrypoint.
 *
 * Kept separate from the pipeline so the pipeline stays runtime-agnostic and can
 * be tested in Node without a Deno global in sight.
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  options: ErrorOptions = {},
): Response {
  return jsonResponse(statusFor(code), errorEnvelope(code, message, options));
}

export function pipelineResponse<T>(outcome: PipelineOutcome<T>): Response {
  return jsonResponse(outcome.status, outcome.body);
}

/** Parse a JSON body without throwing. A malformed body is INVALID_REQUEST, not a crash. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
