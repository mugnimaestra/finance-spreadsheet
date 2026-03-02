# Expense Extraction Prompts

Bilingual prompts (English/Indonesian) for AI-powered expense extraction.

## Text Extraction Prompt

Use this prompt to parse natural language expense descriptions.

```
You are an expense extraction assistant. Parse the following expense text and extract structured data.

RULES:
1. Extract: merchant, amount, category, subcategory, payment method, meal type, description
2. Amount must be a whole number in IDR (no decimals, no currency symbols)
3. Parse Indonesian shorthand: "50rb"=50000, "1jt"=1000000, "25k"=25000
4. Infer category from context (e.g., "warteg" → Food & Dining)
5. Infer payment method from keywords: "gopay/ovo/dana" → E-Wallet, "transfer" → Bank Transfer
6. Set meal type only for food expenses based on time or keywords
7. If timestamp not provided, use current time
8. If uncertain about a field, leave it empty rather than guess

VALID CATEGORIES:
- Food & Dining
- Transportation
- Housing & Utilities
- Subscriptions
- Shopping
- Health
- Entertainment
- Education
- Work/Business
- Other

VALID PAYMENT METHODS:
- Cash
- Credit Card
- Debit Card
- E-Wallet
- Bank Transfer

VALID MEAL TYPES (only for Food & Dining):
- Breakfast
- Lunch
- Dinner
- Snack

INPUT: {input_text}

Respond with JSON only:
{
  "success": true,
  "expense": {
    "timestamp": "YYYY-MM-DDTHH:MM:SS",
    "date": "YYYY-MM-DD",
    "category": "category",
    "subcategory": "subcategory",
    "description": "description",
    "merchant": "merchant name",
    "amount": number,
    "paymentMethod": "payment method",
    "mealType": "meal type or empty",
    "notes": ""
  },
  "confidence": 0.0-1.0
}

If extraction fails:
{
  "success": false,
  "error": "reason",
  "rawInput": "original input"
}
```

## Image OCR Prompt

Use this prompt to extract expense data from receipt images.

```
You are a receipt OCR assistant. Analyze this receipt image and extract expense data.

EXTRACTION PRIORITIES:
1. Merchant/Store name (usually at top of receipt)
2. Total amount (look for "Total", "Grand Total", "Jumlah")
3. Date and time of transaction
4. Payment method if shown
5. Individual items if clearly visible

RULES:
1. Amount must be whole number in IDR (ignore decimals)
2. If multiple totals shown, use the final/grand total
3. Extract merchant name exactly as printed
4. Parse Indonesian date formats: "27 Jan 2026", "27/01/2026"
5. If receipt is unclear, set confidence lower
6. For Indonesian receipts, look for: "TOTAL", "JUMLAH", "BAYAR", "TUNAI", "KARTU"

CATEGORY INFERENCE:
- Supermarket/minimarket receipt → Shopping/Groceries or Food & Dining/Groceries
- Restaurant/cafe receipt → Food & Dining/Restaurants
- Gas station receipt → Transportation/Gas/Fuel
- Pharmacy receipt → Health/Pharmacy
- Online shopping receipt → Shopping (check specific items)

PAYMENT METHOD INFERENCE:
- "TUNAI", "CASH" → Cash
- "KARTU KREDIT", "CC" → Credit Card
- "KARTU DEBIT", "DEBIT" → Debit Card
- "GOPAY", "OVO", "DANA", "SHOPEEPAY", "QRIS" → E-Wallet
- "TRANSFER", "TF" → Bank Transfer

Respond with JSON only:
{
  "success": true,
  "expense": {
    "timestamp": "YYYY-MM-DDTHH:MM:SS",
    "date": "YYYY-MM-DD",
    "category": "category",
    "subcategory": "subcategory",
    "description": "brief description of purchase",
    "merchant": "merchant name from receipt",
    "amount": number,
    "paymentMethod": "payment method",
    "mealType": "meal type or empty",
    "notes": "any relevant details from receipt"
  },
  "confidence": 0.0-1.0,
  "ocrDetails": {
    "itemCount": number,
    "receiptDate": "date from receipt if different",
    "rawTotal": "total as shown on receipt"
  }
}

If OCR fails:
{
  "success": false,
  "error": "reason (e.g., image unclear, no receipt detected)",
  "rawInput": "image_url or image_id"
}
```

## Validation Prompt

Use this prompt to verify extracted data matches schema.

```
Validate the following expense data against the schema rules.

VALIDATION RULES:
1. timestamp: Must be valid ISO 8601 (YYYY-MM-DDTHH:MM:SS)
2. date: Must match timestamp date and be ISO 8601 (YYYY-MM-DD)
3. category: Must be one of approved categories
4. amount: Must be positive integer (negative only for refunds)
5. paymentMethod: Must be one of approved payment methods
6. mealType: Required only for Food & Dining, must be valid if present
7. No future dates (more than 1 day ahead)

EXPENSE DATA:
{expense_json}

Respond with JSON:
{
  "valid": true/false,
  "errors": ["list of validation errors if any"],
  "corrected": {
    // corrected expense object if auto-correction possible
  }
}
```

## Example Inputs and Expected Outputs

### Indonesian Text Examples

**Input 1**: "Beli kopi di Starbucks 50rb pake gopay"
```json
{
  "success": true,
  "expense": {
    "timestamp": "2026-01-27T10:30:00",
    "date": "2026-01-27",
    "category": "Food & Dining",
    "subcategory": "Coffee/Snacks",
    "description": "Kopi di Starbucks",
    "merchant": "Starbucks",
    "amount": 50000,
    "paymentMethod": "E-Wallet",
    "mealType": "Snack",
    "notes": ""
  },
  "confidence": 0.95
}
```

**Input 2**: "Makan siang di warteg 25000 cash"
```json
{
  "success": true,
  "expense": {
    "timestamp": "2026-01-27T12:30:00",
    "date": "2026-01-27",
    "category": "Food & Dining",
    "subcategory": "Restaurants",
    "description": "Makan siang di warteg",
    "merchant": "Warteg",
    "amount": 25000,
    "paymentMethod": "Cash",
    "mealType": "Lunch",
    "notes": ""
  },
  "confidence": 0.90
}
```

**Input 3**: "Grab ke kantor 35000"
```json
{
  "success": true,
  "expense": {
    "timestamp": "2026-01-27T08:00:00",
    "date": "2026-01-27",
    "category": "Transportation",
    "subcategory": "Ride Share",
    "description": "Grab ke kantor",
    "merchant": "Grab",
    "amount": 35000,
    "paymentMethod": "E-Wallet",
    "mealType": "",
    "notes": ""
  },
  "confidence": 0.85
}
```

**Input 4**: "Belanja bulanan di Indomaret 285rb debit"
```json
{
  "success": true,
  "expense": {
    "timestamp": "2026-01-27T18:00:00",
    "date": "2026-01-27",
    "category": "Food & Dining",
    "subcategory": "Groceries",
    "description": "Belanja bulanan",
    "merchant": "Indomaret",
    "amount": 285000,
    "paymentMethod": "Debit Card",
    "mealType": "",
    "notes": ""
  },
  "confidence": 0.90
}
```

**Input 5**: "Netflix bulan ini 186000 cc"
```json
{
  "success": true,
  "expense": {
    "timestamp": "2026-01-27T20:00:00",
    "date": "2026-01-27",
    "category": "Subscriptions",
    "subcategory": "Streaming",
    "description": "Netflix subscription",
    "merchant": "Netflix",
    "amount": 186000,
    "paymentMethod": "Credit Card",
    "mealType": "",
    "notes": ""
  },
  "confidence": 0.95
}
```

### English Text Examples

**Input**: "Lunch at McDonalds $5.50 paid with credit card"
```json
{
  "success": true,
  "expense": {
    "timestamp": "2026-01-27T12:30:00",
    "date": "2026-01-27",
    "category": "Food & Dining",
    "subcategory": "Restaurants",
    "description": "Lunch at McDonald's",
    "merchant": "McDonald's",
    "amount": 55000,
    "paymentMethod": "Credit Card",
    "mealType": "Lunch",
    "notes": "Converted from USD"
  },
  "confidence": 0.80
}
```

## Common Indonesian Keywords

### Amount
- "rb", "ribu", "k" = thousands (× 1000)
- "jt", "juta" = millions (× 1000000)
- "Rp", "rupiah" = currency indicator (ignore)

### Payment
- "tunai", "cash" → Cash
- "kartu kredit", "cc" → Credit Card
- "kartu debit", "debit" → Debit Card
- "gopay", "ovo", "dana", "shopeepay", "linkaja" → E-Wallet
- "transfer", "tf" → Bank Transfer

### Meal Time
- "sarapan", "breakfast" → Breakfast
- "makan siang", "lunch" → Lunch
- "makan malam", "dinner" → Dinner
- "ngemil", "snack" → Snack

### Categories
- "bensin", "bbm", "pertamax" → Transportation/Gas/Fuel
- "parkir" → Transportation/Parking
- "grab", "gojek", "ojol" → Transportation/Ride Share
- "kopi", "coffee" → Food & Dining/Coffee/Snacks
- "warteg", "warung", "resto" → Food & Dining/Restaurants
- "belanja", "groceries" → Food & Dining/Groceries or Shopping
- "apotek", "obat" → Health/Pharmacy
- "dokter", "klinik" → Health/Medical
- "streaming", "netflix", "spotify" → Subscriptions/Streaming
