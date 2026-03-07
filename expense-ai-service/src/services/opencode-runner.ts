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
// Model Configuration - Multi-Model Fallback Chain
// ============================================================================

/**
 * Model fallback chain configuration:
 * 1. Primary: From process.env.OPENCODE_MODEL (user-configurable)
 * 2. Fallback: Kimi K2.5 TEE via Chutes (hardcoded)
 * 3. Last resort: Gemini 1.5 Flash (hardcoded)
 */
const PRIMARY_MODEL = process.env.AI_MODEL || process.env.OPENCODE_MODEL;

// If a specific model is set, use only that model (no fallback)
// Otherwise use the fallback chain
const MODEL_CHAIN: string[] = PRIMARY_MODEL 
  ? [PRIMARY_MODEL]
  : [
      "opencode/big-pickle",
      "github-copilot/gemini-3-flash-preview",
      "chutes/moonshotai/Kimi-K2.5-TEE", 
      "google/gemini-1.5-flash",
    ];

// Backwards compatibility - first model in chain is the default
const DEFAULT_MODEL = MODEL_CHAIN[0];

// ============================================================================
// Agent Wrapper Configuration
// ============================================================================

/**
 * Agent wrapper pattern: 
 * When enabled, uses a free model that delegates to a custom agent (general-opus)
 * This creates a two-hop system: free model → custom agent → actual work
 * Similar to discord-trading-monitor's opencode-agent-wrapper
 */
const USE_AGENT_WRAPPER = process.env.OPENCODE_AGENT_WRAPPER !== "false"; // default true

const AGENT_WRAPPER_MODEL = "opencode/big-pickle";

const AGENT_DELEGATION_SUFFIX = "\n\ndelegate this task into @general-opus";

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
  
  return `You are an expense extraction assistant. Extract expense information from the provided ${sourceType} and return ONLY a valid JSON object matching this exact structure:

{
  "timestamp": "ISO 8601 timestamp of when the expense occurred (e.g., 2024-01-15T14:30:00+07:00)",
  "date": "Date in YYYY-MM-DD format",
  "category": "One of: Food & Dining, Transportation, Housing & Utilities, Subscriptions, Shopping, Health, Entertainment, Education, Work/Business, Other",
  "subcategory": "More specific subcategory within the main category",
  "description": "Brief description of the expense",
  "merchant": "Name of the merchant/store/vendor",
  "amount": <integer amount in IDR (Indonesian Rupiah), no decimals>,
  "paymentMethod": "One of: Cash, Credit Card, Debit Card, E-Wallet, Bank Transfer",
  "mealType": "Only for Food & Dining category - one of: Breakfast, Lunch, Dinner, Snack (omit if not applicable)",
  "notes": "Any additional notes or details (optional, omit if not needed)"
}

IMPORTANT RULES:
1. Return ONLY the JSON object, no additional text or markdown
2. Amount MUST be an integer in IDR (Indonesian Rupiah)
3. If the original amount is in a different currency, convert it to IDR
4. mealType should ONLY be included for "Food & Dining" category
5. Use the current date/time if not explicitly provided
6. Make reasonable inferences for missing fields based on context
7. For category, always use one of the exact values listed above`;
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
 * Extracts JSON from a string that may contain non-JSON content.
 */
function extractJsonFromOutput(output: string): string | null {
  const trimmed = output.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Continue to try other methods
  }

  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      JSON.parse(jsonMatch[0]);
      return jsonMatch[0];
    } catch {
      // Continue to try nested match
    }
  }

  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const codeContent = codeBlockMatch[1].trim();
    const innerJsonMatch = codeContent.match(/\{[\s\S]*\}/);
    if (innerJsonMatch) {
      try {
        JSON.parse(innerJsonMatch[0]);
        return innerJsonMatch[0];
      } catch {
        // Continue
      }
    }
  }

  return null;
}

/**
 * Validates and normalizes expense data.
 */
function validateExpenseData(data: unknown): ExpenseData {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid expense data: not an object");
  }

  const expense = data as Record<string, unknown>;

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
  buildArgs: (model: string, applyWrapper?: boolean) => string[],
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
      
      // Apply agent wrapper if enabled
      const applyWrapper = USE_AGENT_WRAPPER && model === AGENT_WRAPPER_MODEL;
      
      try {
        const args = buildArgs(model, applyWrapper);
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
      (model, applyWrapper) => {
        const promptToUse = applyWrapper ? fullPrompt + AGENT_DELEGATION_SUFFIX : fullPrompt;
        return ["run", "-m", model, promptToUse];
      },
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
      (model, applyWrapper) => {
        const promptToUse = applyWrapper ? prompt + AGENT_DELEGATION_SUFFIX : prompt;
        return ["run", "-m", model, "-f", imagePath, "--", promptToUse];
      },
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
      (model, applyWrapper) => {
        const promptToUse = applyWrapper ? prompt + AGENT_DELEGATION_SUFFIX : prompt;
        return ["run", "-m", model, promptToUse];
      },
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
