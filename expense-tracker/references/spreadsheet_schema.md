# Expense Tracker Spreadsheet Schema

## Spreadsheet Information

**Spreadsheet ID**: `1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI`  
**URL**: https://docs.google.com/spreadsheets/d/1slpWJReikbZC9YZjXlH854H_p3ZYHZ3fFOHVuv0awbI

## Sheet Structure

The spreadsheet contains three sheets:

1. **Expenses** (main data sheet) - All transaction records
2. **Summary** (read-only) - Automatic calculations and breakdowns
3. **Reference** (read-only) - Category and payment method reference

## Expenses Sheet Schema

| Column | Field Name      | Data Type | Format | Required | Notes |
|--------|----------------|-----------|--------|----------|-------|
| A      | Timestamp      | DateTime  | `YYYY-MM-DDTHH:MM:SS` | Yes | ISO 8601 format, local time |
| B      | Date           | Date      | `YYYY-MM-DD` | Yes | Must match timestamp date |
| C      | Category       | String    | Dropdown | Yes | Must match approved list |
| D      | Subcategory    | String    | Free text | No | Prefer reference list |
| E      | Description    | String    | Free text | Yes | Short summary of purchase |
| F      | Merchant/Store | String    | Free text | Yes | Vendor name, consistent casing |
| G      | Amount         | Number    | Integer (IDR) | Yes | Plain number, no decimals, no symbols |
| H      | Payment Method | String    | Dropdown | Yes | Must match approved list |
| I      | Meal Type      | String    | Dropdown | No | Only for Food & Dining |
| J      | Notes          | String    | Free text | No | Optional additional info |

## Approved Values

### Categories
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

### Subcategories (Recommended)
- **Food & Dining**: Groceries, Restaurants, Coffee/Snacks, Delivery
- **Transportation**: Gas/Fuel, Public Transit, Parking, Ride Share, Maintenance
- **Housing & Utilities**: Rent, Electricity, Water, Internet, Phone
- **Subscriptions**: Streaming, Software, Memberships
- **Shopping**: Clothing, Electronics, Home, Personal Care
- **Health**: Medical, Pharmacy, Fitness, Insurance
- **Entertainment**: Movies, Games, Events, Hobbies
- **Education**: Courses, Books, Supplies
- **Work/Business**: Supplies, Travel, Equipment

### Payment Methods
- Cash
- Credit Card
- Debit Card
- E-Wallet
- Bank Transfer

### Meal Types (only for Food & Dining)
- Breakfast
- Lunch
- Dinner
- Snack

## Data Entry Rules

1. **Amount Format**: Plain whole numbers only (e.g., `50000` not `Rp 50.000` or `50000.00`)
2. **Currency**: All amounts in IDR (Indonesian Rupiah)
3. **No Decimals**: IDR doesn't use cents, use whole numbers only
4. **Timestamps**: Must be in ISO 8601 format with local time
5. **Date Alignment**: Date column must match the date portion of Timestamp
6. **Empty Fields**: Leave blank rather than using placeholders like "N/A"
7. **Merchant Names**: Use consistent casing (e.g., always "Indomaret" not "indomaret")
8. **Indonesian Merchants Preferred**: Indomaret, Alfamart, Tokopedia, Grab, GoJek, etc.

## Sample IDR Amount Ranges

- Coffee/snacks: 15,000 - 35,000
- Restaurant meals: 30,000 - 150,000
- Groceries: 100,000 - 500,000
- Gas/fuel (full tank): 300,000 - 500,000
- Ride share: 15,000 - 50,000
- Movie tickets: 50,000 - 100,000
- Subscriptions: 50,000 - 200,000/month
