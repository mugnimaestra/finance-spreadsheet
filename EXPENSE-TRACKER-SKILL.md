# Expense Tracker Skill

A custom skill for managing your Google Sheets expense tracker with Indonesian Rupiah (IDR) formatting and automatic categorization.

## Installation

The skill has been packaged and is ready to use:

**File**: `expense-tracker.skill`

To install this skill in your AI assistant:

1. Load the `expense-tracker.skill` file into your AI environment
2. The skill will automatically trigger when you ask to add, update, or query expenses

## Usage Examples

Once installed, you can interact with your expense tracker naturally:

### Adding Expenses

**Example 1: Basic expense**
```
User: "I bought coffee at Kopi Kenangan for 25000"
```
The AI will automatically:
- Extract amount (25000), merchant (Kopi Kenangan)
- Categorize as "Food & Dining" > "Coffee/Snacks"
- Add timestamp and date
- Save to your spreadsheet

**Example 2: With payment method**
```
User: "Add expense: lunch at Warteg Bahari, 35000, paid with cash"
```

**Example 3: Transportation**
```
User: "Record my Grab ride to the office, cost 22000"
```

**Example 4: Subscription**
```
User: "Log my Netflix payment of 186000"
```

### Querying Expenses

**Example 1: Category totals**
```
User: "How much did I spend on food this month?"
```

**Example 2: Recent transactions**
```
User: "Show me my last 5 expenses"
```

**Example 3: Specific merchant**
```
User: "How many times did I go to Indomaret this week?"
```

## Features

✅ **Smart Categorization**: Automatically assigns categories and subcategories
✅ **IDR Formatting**: Handles Indonesian Rupiah with proper formatting (no decimals)
✅ **Indonesian Merchants**: Recognizes common Indonesian stores and services
✅ **Timestamp Generation**: Automatically adds current date/time
✅ **Data Validation**: Ensures all entries match approved categories and formats
✅ **Natural Language**: Just describe your expense naturally

## Supported Categories

- Food & Dining (Groceries, Restaurants, Coffee/Snacks, Delivery)
- Transportation (Gas/Fuel, Ride Share, Parking, Public Transit)
- Housing & Utilities (Rent, Electricity, Water, Internet, Phone)
- Subscriptions (Streaming, Software, Memberships)
- Shopping (Clothing, Electronics, Home, Personal Care)
- Health (Medical, Pharmacy, Fitness, Insurance)
- Entertainment (Movies, Games, Events, Hobbies)
- Education (Courses, Books, Supplies)
- Work/Business (Supplies, Travel, Equipment)
- Other

## Spreadsheet Information

**Spreadsheet ID**: `1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI`

The spreadsheet contains:
- **Expenses** sheet: Main transaction log
- **Summary** sheet: Auto-calculated totals and breakdowns
- **Reference** sheet: Category and payment method lists

## Data Format

All expense entries include:
- Timestamp (ISO 8601 format)
- Date (YYYY-MM-DD)
- Category & Subcategory
- Description
- Merchant/Store
- Amount (whole numbers in IDR)
- Payment Method (Cash, Credit Card, Debit Card, E-Wallet, Bank Transfer)
- Meal Type (for food entries only)
- Optional notes

## Development

The skill includes:
- `SKILL.md`: Main skill instructions
- `references/spreadsheet_schema.md`: Detailed schema and validation rules

To modify or extend the skill, edit these files and repackage using:
```bash
python3 /path/to/package_skill.py expense-tracker ./
```

## Tips

- Enter amounts as plain numbers (e.g., 25000, not Rp 25.000)
- The AI will automatically format them with currency symbols in the sheet
- Use Indonesian merchant names for better categorization
- Be specific in descriptions for better tracking
- Review your Summary sheet for spending insights

---

**Created**: January 25, 2026  
**Version**: 1.0
