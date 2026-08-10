import {
  PARSE_MAX_TOKENS,
  buildSystemPrompt,
  readParsedJson,
  toUserText,
  type ParseAdapter,
  type ParseInput,
  type ParseOutcome,
} from './parse.ts';

/**
 * The same parse, through OpenRouter.
 *
 * **A switch, not a replacement.** [ADR-0016](../../../../docs/adr/0016-ai-assisted-stop-entry.md)
 * chose `claude-haiku-4-5` and that decision stands; this exists so the endpoint
 * can run against a free model during development without a paid account, and so
 * a cheaper or better model can be tried without an app release.
 * [ADR-0017](../../../../docs/adr/0017-parse-provider-switch.md) records the
 * decision and its one real caution.
 *
 * **Why a weaker model is tolerable here, and only here.** The candidates are
 * shown to the user for review before anything is geocoded
 * ([`docs/08_SCREEN_SPECIFICATIONS.md`](../../../../docs/08_SCREEN_SPECIFICATIONS.md) §8),
 * so a worse model means more rows to correct rather than a driver at the wrong
 * door. The guarantees that actually matter do not come from the model at all:
 * the output is validated field by field, the count is capped at `MAX_STOPS`,
 * and nothing returned is ever used as an instruction, a URL or a query
 * parameter.
 *
 * **The caution, which is not about quality.** Many free endpoints retain
 * prompts for training, and a pasted delivery list is third-party personal data
 * — customers' addresses, not the user's. That is fine for test data and is not
 * fine for a real round. The choice of provider is therefore a data decision
 * before it is a cost one, and `PARSE_PROVIDER` defaults to Anthropic so nobody
 * arrives at the cheaper path by accident.
 */

const COMPLETIONS_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Free at time of writing, and configuration rather than a constant precisely
 *  because "free at time of writing" is not a durable property. */
export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

export interface OpenRouterAdapterOptions {
  readonly apiKey: string;
  readonly fetchImpl: typeof fetch;
  readonly model?: string;
  readonly maxCandidates: number;
  readonly timeoutMs?: number;
}

export function createOpenRouterParseAdapter(options: OpenRouterAdapterOptions): ParseAdapter {
  const { apiKey, fetchImpl, maxCandidates } = options;
  const model = options.model ?? DEFAULT_OPENROUTER_MODEL;
  const timeoutMs = options.timeoutMs ?? 20_000;

  return async (input: ParseInput): Promise<ParseOutcome> => {
    // A longer default timeout than the Anthropic path: a free tier is a queue,
    // and being slow is its normal state rather than a fault.
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(COMPLETIONS_ENDPOINT, {
        method: 'POST',
        signal: timeout.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: PARSE_MAX_TOKENS,
          // Deterministic extraction. Sampling buys nothing when the task is
          // "copy the addresses out" and costs reproducibility when a user
          // re-parses the same paste after a correction.
          temperature: 0,
          // **`response_format` is deliberately not sent.** OpenRouter treats it
          // as a routing *filter*, not a hint: if no provider serving the chosen
          // model supports structured output it matches nothing and answers 404
          // — which is what this endpoint returned in production, with a valid
          // key and a real model, and which reads identically to a model that
          // does not exist.
          //
          // Asking for it bought nothing anyway. `readParsedJson` validates
          // every field regardless, precisely because a structured-output
          // declaration is something a provider may or may not honour, and free
          // models frequently do not. The guarantee was never coming from the
          // flag; only the 404 was.
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: toUserText(input) },
          ],
        }),
      });
    } catch {
      return {
        ok: false,
        failure: timeout.signal.aborted
          ? { kind: 'timeout', retryable: true }
          : { kind: 'unreachable', retryable: true },
      };
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return {
        ok: false,
        failure:
          // 429 is the free tier saying "not now", which is retryable in a way a
          // 400 is not. Treating it as rejected would tell the user their
          // content could not be read when the truth is it has not been tried.
          response.status >= 500 || response.status === 429
            ? { kind: 'unreachable', retryable: true }
            : { kind: 'rejected', retryable: false, status: response.status },
      };
    }

    const payload: unknown = await response.json().catch(() => null);
    const text = readFirstMessage(payload);
    if (text === null) return { ok: false, failure: { kind: 'malformed', retryable: false } };

    return readParsedJson(text, maxCandidates);
  };
}

/**
 * An image is not supported on this path.
 *
 * Free vision models are scarce and inconsistent, and a photographed delivery
 * note that silently comes back empty is worse than one refused with a reason.
 * `toUserText` is text-only for that reason and the endpoint says so.
 */
function readFirstMessage(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;

  for (const choice of choices) {
    if (typeof choice !== 'object' || choice === null) continue;
    const message = (choice as { message?: unknown }).message;
    if (typeof message !== 'object' || message === null) continue;
    const content = (message as { content?: unknown }).content;
    if (typeof content === 'string' && content.trim() !== '') return content;
  }
  return null;
}
