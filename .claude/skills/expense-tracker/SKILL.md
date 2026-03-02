# expense-tracker

Extract expense data from text/images and write to Google Sheets.

## Description

This skill enables AI-powered expense extraction from:
- Natural language text (English and Indonesian)
- Receipt images via OCR

Extracted data is validated against the schema and written to a Google Sheet using the google-docs-mcp server.

## When to Use

Use this skill when:
- Processing expense text like "Beli kopi di Starbucks 50rb pake gopay"
- Extracting data from receipt images
- Writing validated expense entries to Google Sheets
- Converting informal expense descriptions to structured data

## Workflow

### Text Extraction
1. Parse natural language input (supports EN/ID)
2. Extract: merchant, amount, category, payment method, meal type
3. Infer missing fields from context (e.g., "warteg" → Food & Dining, Restaurants)
4. Generate timestamp if not provided
5. Return structured JSON

### Image Extraction
1. Receive image URL or base64 data
2. Use vision model to OCR receipt contents
3. Extract merchant name, items, total amount, date
4. Map to expense schema fields
5. Return structured JSON

### Sheet Writing
1. Validate expense data against schema
2. Connect to Google Sheets via MCP
3. Append row to Expenses sheet
4. Confirm write success

## Output Format

All extraction operations return JSON:

```json
{
  "success": true,
  "expense": {
    "timestamp": "2026-01-27T14:30:00",
    "date": "2026-01-27",
    "category": "Food & Dining",
    "subcategory": "Coffee/Snacks",
    "description": "Kopi Susu",
    "merchant": "Kopi Kenangan",
    "amount": 22000,
    "paymentMethod": "E-Wallet",
    "mealType": "Snack",
    "notes": ""
  },
  "confidence": 0.95
}
```

On error:
```json
{
  "success": false,
  "error": "Could not extract amount from input",
  "rawInput": "original input text"
}
```

## Target Spreadsheet

- **ID**: `1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI`
- **Sheet Name**: `Expenses`
- **URL**: https://docs.google.com/spreadsheets/d/1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI/

## References

- `references/schema.md` - Data schema, categories, payment methods, validation rules
- `references/prompts.md` - Bilingual extraction prompts for text and image processing

## MCP Tools Used

- `google-docs-mcp` - Read/write Google Sheets data
