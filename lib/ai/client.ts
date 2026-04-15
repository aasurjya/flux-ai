import Anthropic from "@anthropic-ai/sdk";
import { z, ZodSchema } from "zod";

/**
 * AI client for flux.ai.
 *
 * Two call shapes:
 *   - callText      → plain assistant text, e.g. short rationale strings
 *   - callStructured → tool_use with a forced schema, Zod-validated, typed output
 *
 * Retries on rate-limit, 5xx, and network errors with exponential backoff.
 * Does NOT retry on 4xx (bad request, auth, permission) — those are bugs, not hiccups.
 */

export class AiClientError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AiClientError";
  }
}

/**
 * Thrown when the LLM's tool_use input fails Zod validation. Separate
 * from AiClientError so callStructured can retry it once — hallucinated
 * outputs often fix themselves on a second try, especially after the
 * model sees the tool signature again.
 */
export class SchemaViolationError extends AiClientError {
  constructor(schemaName: string, zodError: unknown) {
    super(`Schema violation for ${schemaName}`, zodError);
    this.name = "SchemaViolationError";
  }
}

export interface CallTextOptions {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface CallStructuredOptions<T> {
  system: string;
  user: string;
  schema: ZodSchema<T>;
  schemaName: string;
  schemaDescription: string;
  maxTokens?: number;
}

export interface AiClient {
  callText(opts: CallTextOptions): Promise<string>;
  callStructured<T>(opts: CallStructuredOptions<T>): Promise<T>;
}

export interface AiClientOptions {
  apiKey?: string;
  model?: string;
  anthropic?: Anthropic;
  maxRetries?: number;
  baseDelayMs?: number;
  /**
   * How many extra attempts to make when the LLM output passes the
   * network layer but fails Zod validation. 1 = try once, retry once
   * on schema violation. 0 = fail immediately on schema mismatch.
   * Based on 2026 guidance: keep low (2–3 max) because each retry
   * costs a full LLM call.
   */
  maxSchemaRetries?: number;
}

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 2048;

function isRetryable(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAiClient(opts: AiClientOptions = {}): AiClient {
  const { maxRetries = 3, baseDelayMs = 300, maxSchemaRetries = 1, model = DEFAULT_MODEL } = opts;

  let sdk = opts.anthropic;
  if (!sdk) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AI client requires ANTHROPIC_API_KEY (env or opts.apiKey), or an injected Anthropic instance"
      );
    }
    sdk = new Anthropic({ apiKey });
  }

  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err) || attempt === maxRetries) throw err;
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
    throw lastErr;
  }

  async function callText(opts: CallTextOptions): Promise<string> {
    const { system, user, maxTokens = DEFAULT_MAX_TOKENS } = opts;
    return withRetry(async () => {
      const response = await sdk!.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }]
      });
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        throw new AiClientError("Expected a text response but got tool_use or empty content");
      }
      return block.text;
    });
  }

  async function callStructured<T>(opts: CallStructuredOptions<T>): Promise<T> {
    const { system, user, schema, schemaName, schemaDescription, maxTokens = DEFAULT_MAX_TOKENS } = opts;
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;

    // Schema-retry loop. Each attempt runs the full network-retry cycle.
    // On SchemaViolationError we amend the user message with the Zod
    // error so the model sees what it got wrong, then try again. Network
    // errors still bubble via the outer withRetry.
    let lastSchemaError: SchemaViolationError | null = null;
    for (let schemaAttempt = 0; schemaAttempt <= maxSchemaRetries; schemaAttempt++) {
      const userMessage = schemaAttempt === 0 || !lastSchemaError
        ? user
        : `${user}\n\n[Retry] Your previous response failed validation: ${String(
            (lastSchemaError.cause as { message?: string } | undefined)?.message ?? "schema mismatch"
          ).slice(0, 400)}. Emit a corrected response that matches the tool schema exactly.`;

      try {
        return await withRetry(async () => {
          const response = await sdk!.messages.create({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: userMessage }],
            tools: [
              {
                name: schemaName,
                description: schemaDescription,
                // Anthropic tool input_schema accepts a JSON Schema object.
                // Zod 4 emits draft-2020-12-compatible output.
                input_schema: jsonSchema as unknown as Anthropic.Tool.InputSchema
              }
            ],
            tool_choice: { type: "tool", name: schemaName }
          });

          const block = response.content.find(
            (b) => b.type === "tool_use" && b.name === schemaName
          );
          if (!block || block.type !== "tool_use") {
            throw new AiClientError(`Expected a tool_use block for ${schemaName}`);
          }

          const parsed = schema.safeParse(block.input);
          if (!parsed.success) {
            throw new SchemaViolationError(schemaName, parsed.error);
          }
          return parsed.data;
        });
      } catch (err) {
        if (err instanceof SchemaViolationError && schemaAttempt < maxSchemaRetries) {
          lastSchemaError = err;
          continue; // retry with corrective prompt
        }
        throw err;
      }
    }
    // Exhausted retries — throw the last schema error
    throw lastSchemaError!;
  }

  return { callText, callStructured };
}

let defaultClient: AiClient | null = null;

/** Lazy-initialised singleton for product code. Tests should use createAiClient directly. */
export function getAiClient(): AiClient {
  if (!defaultClient) {
    defaultClient = createAiClient();
  }
  return defaultClient;
}

/** Reset the singleton. Primarily for tests. */
export function resetDefaultAiClient(): void {
  defaultClient = null;
}
