# Expense Tracker Data Schema

## CSV Header Format

The header order is fixed and must remain exactly:

```
Timestamp,Date,Category,Subcategory,Description,Merchant/Store,Amount,Payment Method,Meal Type,Notes
```

## Field Definitions

| Field | Format | Required | Description |
|-------|--------|----------|-------------|
| Timestamp | ISO 8601 `YYYY-MM-DDTHH:MM:SS` | Yes | Local time of expense |
| Date | ISO 8601 `YYYY-MM-DD` | Yes | Must match timestamp date |
| Category | Enum | Yes | One of approved categories |
| Subcategory | String | No | Free text, prefer reference list |
| Description | String | Yes | Short human-readable summary |
| Merchant/Store | String | Yes | Vendor name, consistent casing |
| Amount | Integer | Yes | Whole number in IDR |
| Payment Method | Enum | Yes | One of approved options |
| Meal Type | Enum | Conditional | Required for Food & Dining, empty otherwise |
| Notes | String | No | Optional, keep concise |

## Approved Categories

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

## Subcategory Reference

### Food & Dining
- Groceries
- Restaurants
- Coffee/Snacks
- Delivery

### Transportation
- Gas/Fuel
- Public Transit
- Parking
- Ride Share
- Maintenance

### Housing & Utilities
- Rent
- Electricity
- Water
- Internet
- Phone

### Subscriptions
- Streaming
- Software
- Memberships

### Shopping
- Clothing
- Electronics
- Home
- Personal Care

### Health
- Medical
- Pharmacy
- Fitness
- Insurance

### Entertainment
- Movies
- Games
- Events
- Hobbies

### Education
- Courses
- Books
- Supplies

### Work/Business
- Supplies
- Travel
- Equipment

## Payment Method Options

- Cash
- Credit Card
- Debit Card
- E-Wallet
- Bank Transfer

## Meal Type Options

Only applicable for Food & Dining category:

- Breakfast
- Lunch
- Dinner
- Snack

## Amount Format

- Whole numbers only (no decimals)
- Currency: IDR (Indonesian Rupiah)
- No currency symbols in data
- Positive for expenses, negative for refunds
- Examples: `50000`, `285000`, `15000`

## Indonesian Merchant Examples

Common merchants to recognize:

### Retail
- Indomaret
- Alfamart
- Hypermart
- Giant
- Carrefour

### Food & Beverage
- Kopi Kenangan
- Starbucks
- McDonald's
- KFC
- Warteg (generic warung)
- GoFood
- GrabFood
- ShopeeFood

### Transportation
- Grab
- GoJek
- Pertamina
- Shell
- TransJakarta
- MRT Jakarta
- KRL

### E-Commerce
- Tokopedia
- Shopee
- Lazada
- Bukalapak
- Blibli

### Healthcare
- Kimia Farma
- Guardian
- Century
- Halodoc
- Alodokter

### Entertainment
- CGV Cinemas
- XXI
- Spotify
- Netflix
- Vidio

## Indonesian Amount Patterns

Common informal amount expressions:

| Input | Parsed Amount |
|-------|---------------|
| `50rb` / `50k` | 50000 |
| `1jt` / `1juta` | 1000000 |
| `150ribu` | 150000 |
| `25.000` | 25000 |
| `Rp 50.000` | 50000 |

## Validation Rules

1. Timestamp must be valid ISO 8601 format
2. Date must match timestamp's date component
3. Category must be from approved list
4. Amount must be positive integer (negative only for refunds)
5. Payment Method must be from approved list
6. Meal Type required only for Food & Dining category
7. No future dates (more than 1 day ahead)

## Target Spreadsheet

- **Spreadsheet ID**: `1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI`
- **Sheet Name**: `Expenses`
- **URL**: https://docs.google.com/spreadsheets/d/1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI/
