# Expense Extraction Prompts

> ⚠️ **Source of truth**: The runtime prompt lives in
> `expense-ai-service/src/services/opencode-runner.ts` (`getExtractionPrompt`).
> This document mirrors the runtime contract for reference, training data, and
> onboarding. **If the two ever diverge, the runtime wins — update this file
> to match.**

Bilingual (English / Indonesian) prompts for AI-powered expense extraction.
The parser in `expense.ts` validates a **flat** JSON object — no envelope,
no `success`/`confidence` wrapper.

## Output Schema (FLAT)

The model must return a single JSON object with top-level fields only:

```json
{
  "timestamp": "ISO 8601 with +07:00 (Asia/Jakarta)",
  "date": "YYYY-MM-DD matching timestamp",
  "category": "<one of the 10 enums>",
  "subcategory": "Title Case noun phrase",
  "description": "≤80 chars",
  "merchant": "Title case, preserve brand caps",
  "amount": 45000,
  "paymentMethod": "<one of the 5 enums>",
  "mealType": "Breakfast|Lunch|Dinner|Snack (only if Food & Dining; else omit)",
  "notes": "optional, omit if not needed"
}
```

### Field requirements

- **Required**: `timestamp`, `date`, `category`, `subcategory`, `description`,
  `merchant`, `amount`, `paymentMethod`
- **Optional**: `mealType`, `notes`
- If a required field is unknown → use empty string `""`
  (NOT `null`, NOT omitted, NOT the literal word "unknown")
- `amount` is a positive integer in IDR. No decimals. No currency symbols.
  Use a negative integer only for refunds.

## Enum Sets (must match runtime exactly)

### `category`
```
Food & Dining | Transportation | Housing & Utilities | Subscriptions |
Shopping | Health | Entertainment | Education | Work/Business | Other
```

### `paymentMethod`
```
Cash | Credit Card | Debit Card | E-Wallet | Bank Transfer
```

### `mealType` (only when `category` is `Food & Dining`)
```
Breakfast | Lunch | Dinner | Snack
```

## Output Enforcement

The runtime parser is strict. The model MUST:

- Return **raw JSON only** — no prose, no preamble, no trailing commentary.
- Emit **no markdown fences** (no ```` ```json ```` wrappers).
- Emit **no `Thinking:` blocks** or chain-of-thought.
- Produce output that satisfies `JSON.parse()` on the first attempt.
- Start the response with `{` and end with `}`.

## Bilingual Handling

### Indonesian shorthand → IDR integer

| Suffix         | Multiplier  | Example         |
| -------------- | ----------- | --------------- |
| `rb`, `ribu`, `k` | × 1,000     | `45rb` → `45000` |
| `jt`, `juta`, `m` | × 1,000,000 | `1.5jt` → `1500000` |
| `Rp`, `rupiah` | (ignore)    | `Rp25.000` → `25000` |

### Payment keyword → enum

| ID / EN keyword                                        | `paymentMethod`  |
| ------------------------------------------------------ | ---------------- |
| `tunai`, `cash`                                        | `Cash`           |
| `kartu kredit`, `cc`, `credit card`                    | `Credit Card`    |
| `kartu debit`, `debit`, `debit card`                   | `Debit Card`     |
| `gopay`, `ovo`, `dana`, `shopeepay`, `linkaja`, `qris` | `E-Wallet`       |
| `transfer`, `tf`, `bank transfer`                      | `Bank Transfer`  |

### Meal keyword → enum

| ID / EN keyword                  | `mealType`  |
| -------------------------------- | ----------- |
| `sarapan`, `breakfast`, `pagi`   | `Breakfast` |
| `makan siang`, `lunch`, `siang`  | `Lunch`     |
| `makan malam`, `dinner`, `malam` | `Dinner`    |
| `ngemil`, `snack`, `cemilan`     | `Snack`     |

### Category hint table

| Keyword                                     | `category` / `subcategory`            |
| ------------------------------------------- | ------------------------------------- |
| `bensin`, `bbm`, `pertamax`, `solar`        | Transportation / Gas/Fuel             |
| `parkir`                                    | Transportation / Parking              |
| `grab`, `gojek`, `ojol`, `uber`             | Transportation / Ride Share           |
| `transjakarta`, `mrt`, `krl`, `bus`         | Transportation / Public Transit       |
| `kopi`, `coffee`, `starbucks`               | Food & Dining / Coffee/Snacks         |
| `warteg`, `warung`, `resto`, `restaurant`   | Food & Dining / Restaurants           |
| `belanja bulanan`, `groceries`, `indomaret` | Food & Dining / Groceries             |
| `gofood`, `grabfood`, `delivery`            | Food & Dining / Delivery              |
| `apotek`, `obat`, `pharmacy`                | Health / Pharmacy                     |
| `dokter`, `klinik`, `rumah sakit`           | Health / Medical                      |
| `gym`, `fitness`                            | Health / Fitness                      |
| `netflix`, `spotify`, `disney+`, `streaming`| Subscriptions / Streaming             |
| `listrik`, `pln`                            | Housing & Utilities / Electricity     |
| `air`, `pdam`                               | Housing & Utilities / Water           |
| `internet`, `wifi`, `indihome`              | Housing & Utilities / Internet        |
| `pulsa`, `phone`                            | Housing & Utilities / Phone           |

### Foreign currency

If the input states a non-IDR amount, convert to IDR at **~16,000 IDR/USD**
(use a similar approximate rate for other currencies) and add a note:

```json
"notes": "Converted from <X> <CURRENCY>"
```

Example: `$5.50 USD` → `amount: 88000`, `notes: "Converted from 5.50 USD"`.

## Text Extraction Prompt

Use for natural-language input (chat messages, voice transcripts, manual notes).

```
You are an expense extraction assistant. Parse the input and return ONE flat
JSON object matching the schema below. Output raw JSON only — no prose, no
markdown fences, no "Thinking:" blocks. Start with `{`, end with `}`.

REQUIRED FIELDS (use "" if unknown):
  timestamp, date, category, subcategory, description, merchant, amount,
  paymentMethod
OPTIONAL FIELDS (omit if not applicable):
  mealType, notes

ENUMS:
  category:      Food & Dining | Transportation | Housing & Utilities |
                 Subscriptions | Shopping | Health | Entertainment |
                 Education | Work/Business | Other
  paymentMethod: Cash | Credit Card | Debit Card | E-Wallet | Bank Transfer
  mealType:      Breakfast | Lunch | Dinner | Snack   (Food & Dining only)

RULES:
  - timestamp: ISO 8601 with `+07:00` offset (Asia/Jakarta). Use current
    time if not specified.
  - date: YYYY-MM-DD matching the timestamp date.
  - amount: positive whole integer in IDR. Parse Indonesian shorthand
    (rb/ribu/k = ×1000; jt/juta/m = ×1,000,000).
  - For non-IDR amounts, convert at ~16,000 IDR/USD and add
    notes: "Converted from <X> <CURRENCY>".
  - Infer category and paymentMethod from keywords (see hint tables).
  - merchant: title case, preserve brand capitalization.
  - description: ≤80 chars, concise human summary.

INPUT: {input_text}
```

## Image / Receipt Extraction Prompt

Use for receipt photos. Adds OCR-specific guidance on top of the text prompt.

```
You are a receipt OCR + expense extraction assistant. Read the receipt image
and return ONE flat JSON object matching the schema. Output raw JSON only —
no prose, no markdown fences, no "Thinking:" blocks. Start with `{`,
end with `}`.

OCR PRIORITIES:
  1. merchant       — usually printed at the top (logo / store name header).
  2. amount         — final total. Look for: TOTAL, JUMLAH, GRAND TOTAL,
                      BAYAR, TOTAL BAYAR. If multiple totals appear, take
                      the final/grand total.
  3. timestamp/date — receipt header or footer. Parse Indonesian formats:
                      "27 Jan 2026", "27/01/2026", "27-01-2026".
  4. paymentMethod  — printed near total: TUNAI/CASH, KARTU KREDIT/CC,
                      KARTU DEBIT/DEBIT, GOPAY/OVO/DANA/QRIS, TRANSFER/TF.
  5. category       — infer from merchant type (minimarket → Groceries,
                      cafe → Coffee/Snacks, SPBU → Gas/Fuel, etc.).

REQUIRED FIELDS (use "" if unreadable):
  timestamp, date, category, subcategory, description, merchant, amount,
  paymentMethod
OPTIONAL FIELDS:
  mealType, notes

ENUMS:
  category:      Food & Dining | Transportation | Housing & Utilities |
                 Subscriptions | Shopping | Health | Entertainment |
                 Education | Work/Business | Other
  paymentMethod: Cash | Credit Card | Debit Card | E-Wallet | Bank Transfer
  mealType:      Breakfast | Lunch | Dinner | Snack   (Food & Dining only)

RULES:
  - amount is a whole IDR integer; ignore decimal cents.
  - If the image is partially unclear, make your best guess for required
    fields rather than refusing — never return null or omit a required key.
  - Use the receipt's own date/time for timestamp when readable; otherwise
    fall back to current time with `+07:00`.
  - merchant: copy as printed, normalized to title case (preserve brand caps).
```

## One-Shot Example (canonical)

```
INPUT:  Beli kopi di Starbucks 45rb pakai gopay tadi sore

OUTPUT: {"timestamp":"2026-05-02T16:30:00+07:00","date":"2026-05-02","category":"Food & Dining","subcategory":"Coffee/Snacks","description":"Kopi di Starbucks","merchant":"Starbucks","amount":45000,"paymentMethod":"E-Wallet","mealType":"Snack"}
```

## Additional Examples

### Indonesian text

**Input**: `Makan siang di warteg 25rb cash`
```json
{"timestamp":"2026-05-02T12:30:00+07:00","date":"2026-05-02","category":"Food & Dining","subcategory":"Restaurants","description":"Makan siang di warteg","merchant":"Warteg","amount":25000,"paymentMethod":"Cash","mealType":"Lunch"}
```

**Input**: `Grab ke kantor 35000`
```json
{"timestamp":"2026-05-02T08:00:00+07:00","date":"2026-05-02","category":"Transportation","subcategory":"Ride Share","description":"Grab ke kantor","merchant":"Grab","amount":35000,"paymentMethod":"E-Wallet"}
```

**Input**: `Belanja bulanan di Indomaret 285rb debit`
```json
{"timestamp":"2026-05-02T18:00:00+07:00","date":"2026-05-02","category":"Food & Dining","subcategory":"Groceries","description":"Belanja bulanan","merchant":"Indomaret","amount":285000,"paymentMethod":"Debit Card"}
```

**Input**: `Netflix bulan ini 186000 cc`
```json
{"timestamp":"2026-05-02T20:00:00+07:00","date":"2026-05-02","category":"Subscriptions","subcategory":"Streaming","description":"Netflix subscription","merchant":"Netflix","amount":186000,"paymentMethod":"Credit Card"}
```

### English text (foreign currency)

**Input**: `Lunch at McDonald's $5.50 paid with credit card`
```json
{"timestamp":"2026-05-02T12:30:00+07:00","date":"2026-05-02","category":"Food & Dining","subcategory":"Restaurants","description":"Lunch at McDonald's","merchant":"McDonald's","amount":88000,"paymentMethod":"Credit Card","mealType":"Lunch","notes":"Converted from 5.50 USD"}
```
