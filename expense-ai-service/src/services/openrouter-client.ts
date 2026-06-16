/**
 * Direct OpenRouter chat completions client.
 *
 * Why this exists:
 * The opencode CLI injects tool/skill capability requests on requests it
 * proxies to OpenRouter, which causes HTTP 404 ("No endpoints found that
 * support tool use") on the free vision auto-router — even when the agent
 * is configured with all tools/MCP disabled. This module bypasses opencode
 * entirely for the stateless extraction calls. `writeExpenseToSheets` still
 * uses opencode because it needs MCP.
 */

import { readFile } from "fs/promises";
import { extname } from "path";

export type ChatRole = "system" | "user" | "assistant";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  responseFormat?: "json_object" | "text";
  timeoutMs?: number;
  temperature?: number;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Call OpenRouter chat completions and return raw assistant content string.
 * Throws on non-2xx response or transport error with descriptive message.
 */
export async function chatCompletion(
  opts: ChatCompletionOptions
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY env var is missing — required for direct OpenRouter calls"
    );
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.responseFormat) {
    body.response_format = { type: opts.responseFormat };
  }
  if (typeof opts.temperature === "number") {
    body.temperature = opts.temperature;
  }

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://opencode-agent.mugnimaestra.dev",
        "X-Title": "expense-ai-service",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = err as Error;
    if (e.name === "AbortError") {
      throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`);
    }
    throw new Error(`OpenRouter transport error: ${e.message}`);
  }
  clearTimeout(timer);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter HTTP ${response.status}: ${text.slice(0, 1000)}`
    );
  }

  let data: any;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(
      `OpenRouter response was not JSON: ${(err as Error).message}`
    );
  }

  // OpenRouter sometimes returns errors as 200 with an "error" field
  if (data?.error) {
    const code = data.error.code ?? "unknown";
    const msg = data.error.message ?? JSON.stringify(data.error);
    throw new Error(`OpenRouter error (${code}): ${msg}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(
      `OpenRouter returned empty content. Raw: ${JSON.stringify(data).slice(0, 500)}`
    );
  }
  return content;
}

/**
 * Read an image file from disk and return a base64 data URL suitable for
 * OpenRouter multimodal `image_url` parts.
 */
export async function imageToDataUrl(imagePath: string): Promise<string> {
  const ext = extname(imagePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  const buf = await readFile(imagePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Default extraction model. Uses OpenRouter's free auto-router which
 * selects a free vision-capable model per request.
 *
 * Override at runtime via OPENROUTER_EXTRACT_MODELS env (comma-separated).
 */
export const DEFAULT_EXTRACT_MODELS = [
  "openrouter/free",
];

/**
 * Set of model IDs that accept {response_format: {type: "json_object"}}
 * on their backend. Models NOT in this set will be called WITHOUT
 * response_format, and the caller must rely on prompt instructions +
 * extractJsonFromOutput for JSON parsing.
 *
 * Membership is determined by both:
 *   1. The model's supported_parameters at https://openrouter.ai/api/v1/models
 *   2. Empirical confirmation that the upstream backend honors the field
 *      (some Google models advertise it but Vertex still rejects with
 *      HTTP 400 "JSON mode is not enabled" — those are NOT in this set).
 */
export const JSON_MODE_CAPABLE: ReadonlySet<string> = new Set([
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-3-27b-it:free",
]);

/**
 * Resolve the model rotation list from env or use the default.
 */
export function getExtractModels(): string[] {
  const env = process.env.OPENROUTER_EXTRACT_MODELS?.trim();
  if (!env) return [...DEFAULT_EXTRACT_MODELS];
  return env
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Call chatCompletion across a rotation of models. Retries on transient
 * provider errors (HTTP 429, 408, 5xx) with the next model in the list.
 * Returns the first successful response.
 *
 * Non-transient errors (4xx other than 429/408) abort immediately — no
 * point retrying a malformed request or a missing model with another model
 * unless the failure is rate-limit / timeout / server-side.
 *
 * @param models    Ordered list of models to try. If empty, throws.
 * @param opts      Same as chatCompletion, but with `model` omitted —
 *                  the model is supplied per-attempt from the rotation list.
 * @param backoffMs Deprecated and ignored. Backoff is jittered 2-5s between
 *                  attempts; kept on the signature for backward compatibility.
 */
export async function chatCompletionWithRotation(
  models: string[],
  opts: Omit<ChatCompletionOptions, "model">,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _backoffMs = 500,
): Promise<string> {
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error("chatCompletionWithRotation: models list is empty");
  }

  const failures: { model: string; error: string }[] = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const useJsonMode = JSON_MODE_CAPABLE.has(model);
      // chatCompletion only sets response_format when truthy (see line `if (opts.responseFormat)`),
      // so spreading with responseFormat: undefined is safe for non-JSON-mode models.
      const callOpts: ChatCompletionOptions = useJsonMode
        ? { ...opts, model }
        : { ...opts, model, responseFormat: undefined };
      console.log(
        `[openrouter] Attempt ${i + 1}/${models.length} with model: ${model} (jsonMode=${useJsonMode})`,
      );
      const result = await chatCompletion(callOpts);
      if (i > 0) {
        console.log(
          `[openrouter] Recovered on attempt ${i + 1}/${models.length} with ${model}. Earlier failures: ${failures.map((f) => `${f.model}=${f.error}`).join(" | ")}`,
        );
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Transient: retry with the next model in the rotation.
      //
      // Includes:
      //   - HTTP 408 timeout, 429 rate-limit, 5xx server errors
      //   - HTTP 404 — model retired or "No endpoints found that support ..."
      //   - HTTP 400 with capability-mismatch hints (JSON mode / response_format
      //     not enabled or supported on this backend)
      //   - Generic timeout / rate-limit / network words in the error string
      //
      // Non-transient (aborts rotation): genuine 400/401/402/403 such as
      // malformed payload, bad auth, missing credits, content policy.
      const transient =
        /\b(408|429|5\d\d)\b/.test(msg) ||
        /rate[\s-]?limit/i.test(msg) ||
        /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED/i.test(msg) ||
        // 404: missing model / no endpoints
        (/\b404\b/.test(msg) &&
          /(no endpoints|not found|model.*not.*available)/i.test(msg)) ||
        // 400 capability mismatch — try the next model
        (/\b400\b/.test(msg) &&
          /(json mode|response[_\s-]?format|not (enabled|supported)|tool use)/i.test(
            msg,
          ));

      failures.push({ model, error: msg.slice(0, 200) });

      if (!transient) {
        console.error(
          `[openrouter] Non-transient error on ${model}, aborting rotation: ${msg.slice(0, 300)}`,
        );
        throw err;
      }

      console.warn(
        `[openrouter] Transient error on ${model} (attempt ${i + 1}/${models.length}): ${msg.slice(0, 200)}`,
      );

      if (i < models.length - 1) {
        // Jittered backoff: 2000-5000ms. Helps transient upstream rate limits
        // (especially Google Vertex's 429 storms) clear between attempts and
        // de-correlates retries across concurrent requests.
        const jitterMs = 2000 + Math.floor(Math.random() * 3000);
        console.log(`[openrouter] Backing off ${jitterMs}ms before next attempt`);
        await new Promise((r) => setTimeout(r, jitterMs));
      }
    }
  }

  const summary = failures.map((f) => `${f.model}: ${f.error}`).join(" || ");
  throw new Error(
    `OpenRouter rotation exhausted after ${models.length} attempts. Failures: ${summary}`,
  );
}
