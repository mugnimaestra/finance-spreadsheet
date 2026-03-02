---
name: expense-tracker
description: Manage and update a Google Sheets expense tracker with IDR transactions. Use when the user asks to (1) add/record/log an expense or transaction, (2) update existing expense entries, (3) query or analyze expense data, (4) check spending by category or time period, or (5) work with the expense tracking spreadsheet. Handles Indonesian Rupiah amounts with proper formatting.
---

# Expense Tracker

Manage expenses in a Google Sheets tracker with automatic IDR formatting and category validation.

## Quick Start

The expense tracker uses Google Sheets with three sheets:
- **Expenses**: Main transaction log (you'll work with this)
- **Summary**: Auto-calculated totals (read-only)
- **Reference**: Category lists (read-only)

**Spreadsheet ID**: `1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI`

For detailed schema and validation rules, see [spreadsheet_schema.md](references/spreadsheet_schema.md).

## Adding Expenses

When the user asks to add an expense, follow this workflow:

### Step 1: Extract Information

Parse the user's message to extract:
- **Amount** (required): Plain number in IDR (e.g., `25000`)
- **Description** (required): What was purchased
- **Merchant** (required): Where it was purchased
- **Category** (required): See approved categories below
- **Payment method** (optional, default to "Cash" if unclear)
- **Meal type** (optional, only for Food & Dining)
- **Notes** (optional)

### Step 2: Generate Timestamp and Date

- **Timestamp**: Current date/time in ISO 8601 format `YYYY-MM-DDTHH:MM:SS`
- **Date**: Current date in ISO 8601 format `YYYY-MM-DD`

Example: `2026-01-25T14:30:00` and `2026-01-25`

### Step 3: Validate Category

Ensure the category matches one of these approved values:
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

If the user's input doesn't clearly match, intelligently map it to the closest category.

### Step 4: Assign Subcategory

Choose an appropriate subcategory from the recommended list:
- **Food & Dining**: Groceries, Restaurants, Coffee/Snacks, Delivery
- **Transportation**: Gas/Fuel, Public Transit, Parking, Ride Share, Maintenance
- **Housing & Utilities**: Rent, Electricity, Water, Internet, Phone
- **Subscriptions**: Streaming, Software, Memberships
- **Shopping**: Clothing, Electronics, Home, Personal Care
- **Health**: Medical, Pharmacy, Fitness, Insurance
- **Entertainment**: Movies, Games, Events, Hobbies
- **Education**: Courses, Books, Supplies
- **Work/Business**: Supplies, Travel, Equipment

### Step 5: Append to Spreadsheet

Use the `google-docs-mcp_appendSpreadsheetRows` tool to add the entry:

```
Range: "Expenses!A2:J2" (or next available row)
Values: [[timestamp, date, category, subcategory, description, merchant, amount, payment_method, meal_type, notes]]
valueInputOption: "USER_ENTERED"
```

**Important**: 
- Amount must be a plain number (e.g., `50000` not `"50000"` or `"Rp 50.000"`)
- Leave meal_type empty (`""`) unless category is "Food & Dining"
- Empty fields should be `""` not `null` or `"N/A"`

### Example User Request

**User**: "I bought coffee at Kopi Kenangan for 25000"

**Your Response**:
1. Extract: Amount=25000, Description="Kopi Susu", Merchant="Kopi Kenangan"
2. Generate: Timestamp="2026-01-25T14:30:00", Date="2026-01-25"
3. Validate: Category="Food & Dining"
4. Assign: Subcategory="Coffee/Snacks", Meal Type="Snack"
5. Append row: `[["2026-01-25T14:30:00", "2026-01-25", "Food & Dining", "Coffee/Snacks", "Kopi Susu", "Kopi Kenangan", 25000, "Cash", "Snack", ""]]`

## Querying Expenses

When asked to check spending or analyze expenses:

1. Use `google-docs-mcp_readSpreadsheet` to read data from the Expenses sheet
2. Filter/analyze based on user's criteria (category, date range, merchant, etc.)
3. Present results clearly with totals

Example:
```
Range: "Expenses!A2:J100"
```

## Updating Expenses

When asked to modify an existing expense:

1. Read the current data to find the row
2. Use `google-docs-mcp_writeSpreadsheet` to update specific cells
3. Maintain the same data format and validation rules

## Data Format Reminders

✅ **DO**:
- Use plain numbers for amounts: `50000`
- Use ISO 8601 for timestamps: `2026-01-25T14:30:00`
- Keep merchant names consistent: "Indomaret" (not "indomaret")
- Leave optional fields empty with `""`

❌ **DON'T**:
- Add currency symbols: ~~`"Rp 50.000"`~~
- Use decimals: ~~`50000.00`~~
- Use placeholder text: ~~`"N/A"`~~
- Mix date formats: ~~`"25/01/2026"`~~

## Common Indonesian Merchants

For reference when parsing user input:
- **Groceries**: Indomaret, Alfamart, Superindo, Ranch Market
- **Food Delivery**: GoFood, GrabFood, ShopeeFood
- **Ride Share**: Grab, GoJek
- **Gas Stations**: Pertamina, Shell, Total
- **Pharmacies**: Kimia Farma, Guardian, Century
- **Electronics**: Erafone, iBox, Tokopedia
- **Entertainment**: CGV Cinemas, XXI Cinemas
- **Coffee**: Kopi Kenangan, Janji Jiwa, Starbucks

## Reference

For complete schema details, validation rules, and sample amount ranges, see [spreadsheet_schema.md](references/spreadsheet_schema.md).
