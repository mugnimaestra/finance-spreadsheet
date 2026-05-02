import { homedir } from "os";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

export interface ExpenseData {
  timestamp: string;
  date: string;
  category: string;
  subcategory: string;
  description: string;
  merchant: string;
  amount: number;
  paymentMethod: string;
  mealType?: string;
  notes?: string;
}

export type OpenCodeResult = {
  success: boolean;
  data?: ExpenseData;
  error?: string;
};

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * Model configuration:
 * - Primary: From process.env.AI_MODEL (user-configurable)
 * - Default: OpenRouter free auto-router which selects free vision-capable models
 *   per request and handles internal fallback automatically.
 */
const PRIMARY_MODEL = process.env.AI_MODEL || process.env.OPENCODE_MODEL;

const MODEL_CHAIN: string[] = PRIMARY_MODEL
  ? [PRIMARY_MODEL]
  : ["openrouter/openrouter/free"];

// Backwards compatibility - first model in chain is the default
const DEFAULT_MODEL = MODEL_CHAIN[0];

// ============================================================================
// Constants
// ============================================================================

const OPENCODE_PATH = join(homedir(), ".opencode", "bin", "opencode");
const SPREADSHEET_ID = "1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI";
const SHEET_NAME = "Expenses";

const ALLOWED_CATEGORIES = [
  "Food & Dining",
  "Transportation",
  "Housing & Utilities",
  "Subscriptions",
  "Shopping",
  "Health",
  "Entertainment",
  "Education",
  "Work/Business",
  "Other",
] as const;

const PAYMENT_METHODS = [
  "Cash",
  "Credit Card",
  "Debit Card",
  "E-Wallet",
  "Bank Transfer",
] as const;

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

// Per-model retry configuration
const MAX_RETRIES_PER_MODEL = 2;
const INITIAL_DELAY_MS = 1000;

// Per-process safety timeout (seconds)
const PROCESS_TIMEOUT_MS = 90_000;

// ============================================================================
// Concurrency Limiter
// ============================================================================

// Max 1 concurrent opencode process
// (VPS has only 1.9GB RAM, each process uses ~100-200MB)
const MAX_CONCURRENT = 1;
let activeProcesses = 0;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeProcesses < MAX_CONCURRENT) {
    activeProcesses++;
    return;
  }
  // Wait for a slot to become available
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeProcesses++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeProcesses--;
  const next = waitQueue.shift();
  if (next) next();
}

// ============================================================================
// Prompt Templates
// ============================================================================

const getExtractionPrompt = (isImage: boolean): string => {
  const sourceType = isImage ? "receipt/image" : "text";

  const imageSection = isImage
    ? `

IMAGE/RECEIPT:
- Amount: TOTAL/JUMLAH/GRAND TOTAL/BAYAR (use largest if multiple).
- Payment: TUNAI/CASH, KARTU KREDIT/CC, KARTU DEBIT/DEBIT, GOPAY/OVO/DANA/QRIS, TRANSFER/TF.
- Date formats: "27 Jan 2026", "27/01/2026", "27-01-2026".
- Merchant: from receipt header.
- If unclear, best guess — DO NOT refuse. Empty string only for truly missing fields.`
    : "";

  return `OUTPUT FORMAT: Raw JSON only. No prose. No reasoning. No preamble. No markdown code fences. No explanation. Start your response with \`{\` and end with \`}\`.
Your entire response must be exactly one JSON object that satisfies \`JSON.parse()\` on the first attempt.

Extract expense info from the provided ${sourceType}.

SCHEMA (flat, top-level only):
- Required: timestamp, date, category, subcategory, description, merchant, amount, paymentMethod
- Optional: mealType, notes

ENUMS (exact, case-sensitive):
- category: Food & Dining | Transportation | Housing & Utilities | Subscriptions | Shopping | Health | Entertainment | Education | Work/Business | Other
- paymentMethod: Cash | Credit Card | Debit Card | E-Wallet | Bank Transfer
- mealType (only if Food & Dining; else omit): Breakfast | Lunch | Dinner | Snack

FIELD RULES:
- amount: integer IDR, no decimals/separators/symbols. Foreign currency → convert at ~16,000 IDR/USD and add notes "Converted from <ORIG> <CURRENCY>".
- timestamp: ISO 8601 with +07:00 (Asia/Jakarta). If absent, use current local time.
- date: YYYY-MM-DD matching timestamp.
- merchant: title case, preserve brand caps (Starbucks, McDonald's, GoJek).
- subcategory: short noun phrase, title case.
- description: brief, ≤80 chars.
- Unknown fields → empty string "" (NOT null, NOT omitted). Exception: mealType and notes may be omitted entirely.

BILINGUAL HANDLING (Indonesian + English):
- Amount: rb/ribu/k = ×1000; jt/juta/m = ×1,000,000. Ex: 45rb→45000, 1.5jt→1500000, 25k→25000.
- Payment: tunai|cash→Cash; kartu kredit|cc|kredit→Credit Card; kartu debit|debit→Debit Card; gopay|ovo|dana|shopeepay|linkaja|qris|e-wallet|ewallet→E-Wallet; transfer|tf|bca|mandiri|bri|bni→Bank Transfer.
- Meal: sarapan|breakfast→Breakfast; makan siang|lunch→Lunch; makan malam|dinner→Dinner; ngemil|snack|cemilan→Snack.
- Category hints (keyword → category/subcategory):
  warteg|warung|resto|restoran→Food & Dining/Restaurants; kopi|coffee→Food & Dining/Coffee/Snacks; bensin|bbm|pertamax|pertalite|spbu→Transportation/Gas/Fuel; parkir→Transportation/Parking; grab|gojek|ojol|maxim→Transportation/Ride Share; apotek|obat|pharmacy→Health/Pharmacy; dokter|klinik|rs|rumah sakit→Health/Medical; netflix|spotify|disney|youtube premium|hbo→Subscriptions/Streaming; indomaret|alfamart|hypermart|superindo|transmart→Shopping (or Food & Dining/Groceries if grocery-only)

EXAMPLE:
INPUT: "Beli kopi di Starbucks 45rb pakai gopay tadi sore"
OUTPUT:
{"timestamp":"2026-05-02T16:30:00+07:00","date":"2026-05-02","category":"Food & Dining","subcategory":"Coffee/Snacks","description":"Kopi di Starbucks","merchant":"Starbucks","amount":45000,"paymentMethod":"E-Wallet","mealType":"Snack"}${imageSection}

REMINDER: Output the JSON object only. Nothing before. Nothing after. No thinking. No prose.`;
};

/**
 * Generate the write prompt for OpenCode to use google-docs-mcp
 */
const getWritePrompt = (expense: ExpenseData): string => {
  const expenseJson = JSON.stringify(expense);
  
  return `Use the google-docs-mcp tool to append this expense to the Expenses sheet in spreadsheet ${SPREADSHEET_ID}.

Expense data: ${expenseJson}

Use the google-docs-mcp_appendSpreadsheetRows tool with:
- spreadsheetId: ${SPREADSHEET_ID}
- range: "${SHEET_NAME}!A1" (data will be appended after existing rows)
- values: [[timestamp, date, category, subcategory, description, merchant, amount, paymentMethod, mealType, notes]]

Return only a brief confirmation message like "Expense successfully appended to row X".`;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Scans forward through a string and collects all top-level balanced
 * `{...}` substrings, ignoring braces that appear inside string literals.
 * Returns them in document order.
 */
function findAllBalancedJsonCandidates(s: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          candidates.push(s.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return candidates;
}

/**
 * Parse opencode --format json NDJSON stdout and return the concatenated
 * text from all `text` events, in order.
 *
 * opencode emits one JSON object per line. We only care about events with
 * type === "text", whose .part.text holds the actual model response chunks.
 *
 * Lines that are not valid JSON are skipped silently (defensive).
 */
function extractTextFromOpencodeJsonStream(output: string): string {
  const lines = output.split("\n");
  const chunks: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const evt = JSON.parse(trimmed);
      if (
        evt &&
        typeof evt === "object" &&
        evt.type === "text" &&
        evt.part &&
        typeof evt.part.text === "string"
      ) {
        chunks.push(evt.part.text);
      }
    } catch {
      // not a JSON line — skip
    }
  }

  return chunks.join("");
}

/**
 * Extracts JSON from opencode CLI output.
 *
 * Handles:
 * - Pure JSON output
 * - JSON in ```json fences
 * - JSON after "Thinking: ... {example}" reasoning block
 * - ANSI escape codes
 * - Multiple {...} candidates (returns the last valid one)
 */
function extractJsonFromOutput(output: string): string | null {
  // Step 0: if this looks like an opencode --format json NDJSON stream
  // (one JSON object per line), unwrap it to the concatenated text content.
  // Heuristic: first non-empty line parses as JSON with a "type" field.
  const firstNonEmpty = output.split("\n").map(l => l.trim()).find(Boolean);
  if (firstNonEmpty && firstNonEmpty.startsWith("{")) {
    try {
      const probe = JSON.parse(firstNonEmpty);
      if (probe && typeof probe === "object" && typeof probe.type === "string") {
        const unwrapped = extractTextFromOpencodeJsonStream(output);
        if (unwrapped.trim()) {
          // Recurse with the unwrapped text so all the existing fence /
          // candidate-balanced extraction logic still applies.
          return extractJsonFromOutput(unwrapped);
        }
      }
    } catch {
      // fall through to legacy path
    }
  }

  // Step 1: strip noise (ANSI codes + opencode header line).
  let cleaned = output.replace(/\x1b\[[0-9;]*m/g, "");
  cleaned = cleaned.replace(/^>\s*build\s*·.*$/gm, "");
  cleaned = cleaned.trim();

  // Fast path: entire output is valid JSON.
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // continue
  }

  // Fast path: fenced code block(s). Try each, prefer the LAST valid one.
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  const fenceMatches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(cleaned)) !== null) {
    fenceMatches.push(m[1]);
  }
  for (let i = fenceMatches.length - 1; i >= 0; i--) {
    const inner = fenceMatches[i].trim();
    try {
      JSON.parse(inner);
      return inner;
    } catch {
      const innerCandidates = findAllBalancedJsonCandidates(inner);
      for (let j = innerCandidates.length - 1; j >= 0; j--) {
        try {
          JSON.parse(innerCandidates[j]);
          return innerCandidates[j];
        } catch {
          // try next
        }
      }
    }
  }

  // Step 3: collect all balanced top-level JSON objects, return LAST valid one.
  const candidates = findAllBalancedJsonCandidates(cleaned);
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      JSON.parse(candidates[i]);
      return candidates[i];
    } catch {
      // try previous
    }
  }

  // Step 4: diagnostic logging when extraction fails.
  console.error(
    "[extractJsonFromOutput] Failed to extract JSON.",
    `raw_len=${output.length} cleaned_len=${cleaned.length}`,
  );
  console.error(
    "[extractJsonFromOutput] Raw output (first 500):",
    output.slice(0, 500),
  );
  console.error(
    "[extractJsonFromOutput] Raw output (last 500):",
    output.slice(-500),
  );
  return null;
}

/**
 * Sanitize parsed expense fields before validation.
 *
 * Free models inconsistently emit `"mealType": ""` and `"notes": ""` instead
 * of omitting the keys entirely. This pure helper:
 *   1. Drops `mealType` / `notes` if they are empty / whitespace-only / null.
 *   2. Trims whitespace on all known string fields.
 *
 * It does NOT enforce enums or required-field rules — those remain the job
 * of `validateExpenseData`. This is purely defense-in-depth normalization.
 */
function sanitizeExpenseFields(expense: Record<string, unknown>): void {
  const stringFields = [
    "timestamp",
    "date",
    "category",
    "subcategory",
    "description",
    "merchant",
    "paymentMethod",
    "mealType",
    "notes",
  ] as const;

  // Trim whitespace on all string-valued fields.
  for (const field of stringFields) {
    const value = expense[field];
    if (typeof value === "string") {
      expense[field] = value.trim();
    }
  }

  // Drop empty/whitespace-only optional fields entirely so downstream
  // enum checks don't see "" and reject it.
  const optionalFields = ["mealType", "notes"] as const;
  for (const field of optionalFields) {
    const value = expense[field];
    if (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    ) {
      delete expense[field];
    }
  }
}

/**
 * Validates and normalizes expense data.
 */
function validateExpenseData(data: unknown): ExpenseData {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid expense data: not an object");
  }

  const expense = data as Record<string, unknown>;

  // Sanitize before validation: drop empty optional fields and trim strings.
  sanitizeExpenseFields(expense);

  const requiredFields = [
    "timestamp",
    "date",
    "category",
    "subcategory",
    "description",
    "merchant",
    "amount",
    "paymentMethod",
  ];

  for (const field of requiredFields) {
    if (expense[field] === undefined || expense[field] === null) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  const category = String(expense.category);
  if (!ALLOWED_CATEGORIES.includes(category as typeof ALLOWED_CATEGORIES[number])) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${ALLOWED_CATEGORIES.join(", ")}`);
  }

  const paymentMethod = String(expense.paymentMethod);
  if (!PAYMENT_METHODS.includes(paymentMethod as typeof PAYMENT_METHODS[number])) {
    throw new Error(`Invalid payment method: ${paymentMethod}. Must be one of: ${PAYMENT_METHODS.join(", ")}`);
  }

  if (expense.mealType !== undefined && expense.mealType !== null) {
    const mealType = String(expense.mealType);
    if (!MEAL_TYPES.includes(mealType as typeof MEAL_TYPES[number])) {
      throw new Error(`Invalid meal type: ${mealType}. Must be one of: ${MEAL_TYPES.join(", ")}`);
    }
    if (category !== "Food & Dining") {
      delete expense.mealType;
    }
  }

  const amount = Number(expense.amount);
  if (isNaN(amount) || amount < 0) {
    throw new Error(`Invalid amount: ${expense.amount}. Must be a positive number`);
  }

  return {
    timestamp: String(expense.timestamp),
    date: String(expense.date),
    category: category,
    subcategory: String(expense.subcategory),
    description: String(expense.description),
    merchant: String(expense.merchant),
    amount: Math.round(amount),
    paymentMethod: paymentMethod,
    ...(expense.mealType && category === "Food & Dining"
      ? { mealType: String(expense.mealType) }
      : {}),
    ...(expense.notes ? { notes: String(expense.notes) } : {}),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute OpenCode CLI with given arguments.
 * Supports abort signal for cancellation and has a per-process safety timeout.
 */
async function executeOpenCode(args: string[], signal?: AbortSignal): Promise<string> {
  // Bail out early if already aborted
  if (signal?.aborted) {
    throw new Error("Request was aborted");
  }

  const proc = Bun.spawn([OPENCODE_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      CI: "true",
    },
  });

  // Kill process if abort signal fires (client disconnected or timeout)
  const abortHandler = () => {
    try { proc.kill(); } catch {}
  };
  signal?.addEventListener("abort", abortHandler, { once: true });

  // Safety timeout - kill process if it runs too long
  const timeoutId = setTimeout(() => {
    try { proc.kill(); } catch {}
  }, PROCESS_TIMEOUT_MS);

  try {
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (signal?.aborted) {
      throw new Error("Request was aborted");
    }

    if (exitCode !== 0) {
      throw new Error(`opencode exited with code ${exitCode}: ${stderr || stdout}`);
    }

    // Detect silent failures: provider returned no output but wrote to stderr
    // (e.g. OpenRouter free router rejecting `tool_choice` for image requests
    // surfaces as exit-0 + empty stdout + non-empty stderr).
    if (stdout.trim() === "" && stderr.trim() !== "") {
      throw new Error(`opencode produced no output. stderr: ${stderr.trim()}`);
    }

    return stdout;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortHandler);
  }
}

/**
 * Execute a function with retry logic for a single model.
 * Checks abort signal before each retry attempt.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: { model: string; attempt: number },
  maxRetries: number = MAX_RETRIES_PER_MODEL,
  initialDelayMs: number = INITIAL_DELAY_MS,
  signal?: AbortSignal
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Check abort signal before each attempt
    if (signal?.aborted) {
      throw new Error("Request was aborted");
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry if aborted
      if (signal?.aborted) {
        throw new Error("Request was aborted");
      }

      if (attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.error(
          `[Model: ${context.model}] Attempt ${attempt}/${maxRetries} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
        );
        await sleep(delayMs);
      }
    }
  }

  throw lastError ?? new Error("All retry attempts failed");
}

/**
 * Check if an error is a client error (4xx) that shouldn't trigger fallback.
 */
function isClientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  // Check for 4xx errors - these are client errors that won't be fixed by retrying
  return /\b4\d{2}\b/.test(message) || 
         message.includes("invalid") ||
         message.includes("bad request") ||
         message.includes("unauthorized") ||
         message.includes("forbidden") ||
         message.includes("not found");
}

/**
 * Error thrown when all models in the chain have been exhausted.
 */
class ModelChainExhaustedError extends Error {
  constructor(
    public readonly errors: Array<{ model: string; error: Error }>
  ) {
    const modelList = errors.map(e => e.model).join(" -> ");
    const errorMessages = errors.map(e => `[${e.model}] ${e.error.message}`).join("; ");
    super(`All models failed. Chain: ${modelList}. Errors: ${errorMessages}`);
    this.name = "ModelChainExhaustedError";
  }
}

/**
 * Execute OpenCode with multi-model fallback chain.
 * Tries each model in MODEL_CHAIN with retries, falling back to next model on failure.
 * Uses a concurrency limiter to prevent resource exhaustion on the VPS.
 * Creates an AbortController with a 90s timeout as a safety net.
 * 
 * @param buildArgs - Function that builds the args array for a given model
 * @param context - Operation context for logging
 * @param preferredModel - Optional preferred model to try first (overrides MODEL_CHAIN[0])
 */
async function executeWithModelFallback(
  buildArgs: (model: string) => string[],
  context: { operation: string },
  preferredModel?: string
): Promise<string> {
  // Acquire a concurrency slot before proceeding
  await acquireSlot();

  // Create an AbortController with a 90s timeout as a safety net
  const controller = new AbortController();
  const overallTimeout = setTimeout(() => {
    controller.abort();
  }, PROCESS_TIMEOUT_MS);

  try {
    // Build the model chain: preferred model first, then the rest of the chain
    const chain = preferredModel 
      ? [preferredModel, ...MODEL_CHAIN.filter(m => m !== preferredModel)]
      : MODEL_CHAIN;
    
    const errors: Array<{ model: string; error: Error }> = [];
    
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      const isLastModel = i === chain.length - 1;

      // Check if aborted before trying next model
      if (controller.signal.aborted) {
        throw new Error("Request was aborted (timeout)");
      }
      
      console.log(`[${context.operation}] Trying model ${i + 1}/${chain.length}: ${model}`);
      
      try {
        const args = buildArgs(model);
        const result = await withRetry(
          () => executeOpenCode(args, controller.signal),
          { model, attempt: 1 },
          MAX_RETRIES_PER_MODEL,
          INITIAL_DELAY_MS,
          controller.signal
        );
        
        console.log(`[${context.operation}] Success with model: ${model}`);
        return result;
        
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.warn(`[${context.operation}] Model ${model} failed: ${err.message}`);
        errors.push({ model, error: err });

        // Don't fallback if aborted
        if (controller.signal.aborted) {
          throw new Error("Request was aborted (timeout)");
        }
        
        // Don't fallback on client errors (4xx) - these won't be fixed by changing models
        if (isClientError(err)) {
          console.error(`[${context.operation}] Client error detected, not falling back: ${err.message}`);
          break;
        }
        
        // If not the last model, continue to next fallback
        if (!isLastModel) {
          console.log(`[${context.operation}] Falling back to next model...`);
        }
      }
    }
    
    // All models exhausted
    throw new ModelChainExhaustedError(errors);
  } finally {
    clearTimeout(overallTimeout);
    releaseSlot();
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Extract expense data from text description.
 * @param text - The text to extract expense information from
 * @param preferredModel - Optional preferred model to use (falls back to chain if fails)
 */
export async function extractExpenseFromText(
  text: string,
  preferredModel?: string
): Promise<OpenCodeResult> {
  try {
    const prompt = getExtractionPrompt(false);
    const fullPrompt = `${prompt}\n\nHere is the text to extract expense information from:\n\n${text}`;

    const result = await executeWithModelFallback(
      (model) => ["run", "-m", model, "--format", "json", "--", fullPrompt],
      { operation: "extract-text" },
      preferredModel
    );
    
    const jsonStr = extractJsonFromOutput(result);
    if (!jsonStr) {
      throw new Error("Could not extract JSON from opencode output");
    }
    
    const parsed = JSON.parse(jsonStr);
    const validated = validateExpenseData(parsed);

    return {
      success: true,
      data: validated,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Extract expense data from receipt image.
 * @param imagePath - Path to the receipt image
 * @param preferredModel - Optional preferred model to use (falls back to chain if fails)
 */
export async function extractExpenseFromImage(
  imagePath: string,
  preferredModel?: string
): Promise<OpenCodeResult> {
  try {
    const file = Bun.file(imagePath);
    const exists = await file.exists();
    if (!exists) {
      return {
        success: false,
        error: `Image file not found: ${imagePath}`,
      };
    }

    const prompt = getExtractionPrompt(true);

    const result = await executeWithModelFallback(
      (model) => ["run", "-m", model, "--format", "json", "-f", imagePath, "--", prompt],
      { operation: "extract-image" },
      preferredModel
    );
    
    const jsonStr = extractJsonFromOutput(result);
    if (!jsonStr) {
      throw new Error("Could not extract JSON from opencode output");
    }
    
    const parsed = JSON.parse(jsonStr);
    const validated = validateExpenseData(parsed);

    return {
      success: true,
      data: validated,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Writes expense data to Google Sheets using opencode with google-docs-mcp
 * 
 * @param expense - The expense data to write
 * @param preferredModel - Optional preferred model to use (falls back to chain if fails)
 * @returns OpenCodeResult indicating success or failure
 */
export async function writeExpenseToSheets(
  expense: ExpenseData,
  preferredModel?: string
): Promise<OpenCodeResult> {
  try {
    const prompt = getWritePrompt(expense);

    const result = await executeWithModelFallback(
      (model) => ["run", "-m", model, prompt],
      { operation: "write-sheets" },
      preferredModel
    );
    
    console.log("Google Sheets write output:", result);
    
    // Check if output contains error indicators
    if (result.toLowerCase().includes("error") || result.toLowerCase().includes("failed")) {
      throw new Error(`Failed to write to Google Sheets: ${result}`);
    }

    return {
      success: true,
      data: expense,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export {
  ALLOWED_CATEGORIES,
  PAYMENT_METHODS,
  MEAL_TYPES,
  DEFAULT_MODEL,
  MODEL_CHAIN,
};
