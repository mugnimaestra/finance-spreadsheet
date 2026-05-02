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
