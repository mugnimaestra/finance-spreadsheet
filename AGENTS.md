# AGENTS.md

Purpose: guide agents working in this repository.
Keep edits focused on the CSV template and setup instructions.

## Repo overview
- `expense-tracker-template.csv` is the primary data template.
- `SETUP-INSTRUCTIONS.txt` explains Google Sheets import and setup.
- There is no application code, build system, or tests.
- Treat this repo as static data + documentation.

## Build, lint, and test commands
- Build: none. No build system exists.
- Lint: none. No linters configured.
- Test: none. No tests configured.
- Single test: not applicable.
- If you add automation (scripts, CI), update this section with exact commands.

## Data schema (CSV)
- Header order is fixed and must remain exactly:
  `Timestamp,Date,Category,Subcategory,Description,Merchant/Store,Amount,Payment Method,Meal Type,Notes`
- Timestamp: ISO 8601 `YYYY-MM-DDTHH:MM:SS` (local time).
- Date: ISO 8601 `YYYY-MM-DD` (e.g., `2026-01-08`), should match the timestamp date.
- Category: one of the approved top-level categories.
- Subcategory: free text, but prefer the reference list below.
- Description: short human-readable summary of the purchase.
- Merchant/Store: vendor name; keep consistent casing.
- Amount: plain whole number (e.g., `50000`) in IDR; no decimals, no currency symbols.
- Payment Method: one of the approved options.
- Meal Type: only for food entries; otherwise leave empty.
- Notes: optional; keep concise.

## Approved categories
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

## Subcategory reference (recommended)
- Food & Dining: Groceries, Restaurants, Coffee/Snacks, Delivery
- Transportation: Gas/Fuel, Public Transit, Parking, Ride Share, Maintenance
- Housing & Utilities: Rent, Electricity, Water, Internet, Phone
- Subscriptions: Streaming, Software, Memberships
- Shopping: Clothing, Electronics, Home, Personal Care
- Health: Medical, Pharmacy, Fitness, Insurance
- Entertainment: Movies, Games, Events, Hobbies
- Education: Courses, Books, Supplies
- Work/Business: Supplies, Travel, Equipment

## Payment method options
- Cash
- Credit Card
- Debit Card
- E-Wallet
- Bank Transfer

## Meal type options
- Breakfast
- Lunch
- Dinner
- Snack

## Data entry and quality rules
- Keep the header row as the first line; do not add extra headers.
- Use commas as field separators; do not switch to tabs.
- If a field contains a comma, wrap the field in double quotes.
- Prefer empty fields over placeholders like `N/A`.
- Always fill `Timestamp`; keep `Date` aligned with it.
- Amounts should be positive for expenses; use negatives only for refunds.
- If a refund is logged, add a clear note in `Notes`.
- Keep `Category` and `Payment Method` consistent with the lists above.
- Avoid trailing spaces; keep one record per line.
- Do not reorder columns or change column names without updating docs.
- Keep sample rows realistic and consistent with category/meal type.

## Formatting and imports
- Save CSV files using UTF-8 and LF line endings.
- Amounts are whole numbers only; no decimal separator needed.
- Enter amounts as plain integers (e.g., `50000`) without currency symbols.
- When importing into Google Sheets, select "Replace spreadsheet".
- After import, apply IDR currency formatting to column G (Amount).
- For validation, follow the steps in `SETUP-INSTRUCTIONS.txt`.

## Documentation style (SETUP-INSTRUCTIONS.txt)
- Keep the tone instructional and concise.
- Use title case for section headers and a simple ASCII underline.
- Use numbered steps for procedures; use `-` for simple lists.
- Keep line width under ~100 characters for readability.
- Update formulas and dropdown lists together when changes occur.
- Avoid adding emojis or non-ASCII glyphs unless already present.

## Naming conventions
- Use consistent merchant naming (e.g., "Indomaret" not "indomaret").
- Indonesian merchants preferred: Indomaret, Alfamart, Tokopedia, Grab, GoJek, etc.
- Keep descriptions short but specific (what/why).
- Use category capitalization exactly as listed.
- Use title case for `Subcategory` values.

## Error handling and validation
- If a value does not match approved lists, update the list or fix the entry.
- If a row is incomplete, leave fields blank rather than guess.
- Check for obvious timestamp/date typos (future or invalid values).
- When adding new sample rows, keep dates in descending order.
- If changing allowed values, update both CSV samples and setup guide.

## Adding new automation
- This repo has no scripts. Prefer minimal tooling.
- If you add scripts, document them in this file and in `SETUP-INSTRUCTIONS.txt`.
- Keep scripts cross-platform and avoid requiring credentials.
- Add a `README.md` only if it adds value beyond this file.

## Cursor/Copilot rules
- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md` were found.
- If such rules are added, include them verbatim here.

## Working with agents
- Favor simple, reversible changes; avoid restructuring files.
- Keep this file around 150 lines; update sections rather than expand.
- Preserve sample data intent; do not anonymize or randomize unnecessarily.
- When in doubt, follow the patterns in existing rows and instructions.

## Quick reference formulas (Summary sheet)
- Total expenses: `=SUM(Expenses!G:G)`
- Total this month: `=SUMIF(Expenses!B:B,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),Expenses!G:G)`
- Total by category: `=SUMIF(Expenses!C:C,"Food & Dining",Expenses!G:G)`
- Count of transactions: `=COUNTA(Expenses!A2:A)`
- Average transaction: `=AVERAGE(Expenses!G:G)`

## Pivot table reference
- Rows: Category
- Columns: Date (group by Month)
- Values: Amount (SUM)

## Conditional formatting reference
- High expenses: Amount > 100000 -> red background.
- Category color: Category == "Food & Dining" -> light orange.
- Keep these examples aligned with the setup guide.

## Change checklist
- Update `expense-tracker-template.csv` first, then update docs.
- Keep sample rows consistent with new categories/options.
- Run a quick visual scan for commas/quotes before saving.
- Confirm imports still work in Google Sheets.

## AI Integration

This repository contains an OpenCode skill for AI-powered expense tracking.

### Skill Location
- **Path**: `.claude/skills/expense-tracker/`
- **Files**:
  - `SKILL.md` - Skill definition and workflow
  - `references/schema.md` - Data schema, categories, validation rules
  - `references/prompts.md` - Bilingual prompts for text/image extraction

### How the Skill Works
The expense-tracker skill enables AI to:
1. Extract expense data from natural language text (English/Indonesian)
2. Parse receipt images via OCR
3. Validate data against the schema defined in this repo
4. Write entries to Google Sheets using google-docs-mcp

### AI Service
The skill is invoked by an HTTP API service running at:
- **URL**: `https://opencode-agent.mugnimaestra.dev`
- **VPS IP**: `155.94.154.237`
- **Repo on VPS**: `~/projects/finance-spreadsheet/expense-ai-service` (git-based)
- **Full repo clone**: `~/projects/finance-spreadsheet` → `git@github.com:mugnimaestra/finance-spreadsheet.git`
- **Convenience symlink**: `~/projects/expense-ai-service-git` → service directory

The service wraps OpenCode CLI and exposes endpoints for:
- `POST /api/expense/extract/text` - Extract from text
- `POST /api/expense/extract/image` - Extract from receipt image
- `POST /api/expense/write` - Write to Google Sheets

### VPS Deployment
The VPS uses git-based deployment. To deploy changes:

1. Push changes to `main` branch on GitHub
2. SSH to VPS and run the deploy script:
   ```
   ssh mugnimaestra@155.94.154.237 'cd ~/projects/finance-spreadsheet/expense-ai-service && bash scripts/deploy.sh'
   ```

Or manually:
```
cd ~/projects/finance-spreadsheet && git pull origin main
cd expense-ai-service && bun install
systemctl --user restart expense-ai-service
```

> **Warning**: The old directory `~/projects/expense-ai-service-old-backup-20260302`
> is a backup of the previous standalone service directory. It is NOT in use and can
> be safely deleted once confirmed unnecessary.

Key VPS paths:
- **Service directory**: `~/projects/finance-spreadsheet/expense-ai-service/`
- **Systemd service**: user-level unit at `~/.config/systemd/user/expense-ai-service.service`
- **Service port**: 3001 (proxied via nginx)
- **Logs**: `journalctl --user -u expense-ai-service -f`
- **Health check**: `curl http://127.0.0.1:3001/health`

### MCP Configuration
MCP servers are configured in the global OpenCode config at `~/.config/opencode/opencode.json` on the VPS:
```json
{
  "mcp": {
    "google-docs-mcp": {
      "type": "local",
      "command": ["bun", "--bun", "run", "/path/to/google-docs-mcp/dist/server.js"],
      "enabled": true
    }
  }
}
```

### AI Model Configuration

The OpenCode CLI is configured to use the following AI model on the VPS:

- **Current Model**: `google/gemini-3-flash`
- **Config Location**: `~/.config/opencode/opencode.json`
- **Provider**: Google AI (Gemini)
- **API Endpoint**: Google AI Studio / Vertex AI

To change the model, edit the `model` and `small_model` fields in the OpenCode config file.

### Integration with Telegram Bot
The expense tracking feature is exposed via the `telegram-bot-cloudflare` project, allowing users to:
- Send expense messages like "Makan siang warteg 25rb cash"
- Send receipt photos for automatic extraction
- Confirm and save expenses to Google Sheets

## Out of scope
- Do not add personal financial data.
- Do not add proprietary data or credentials.
- Avoid converting the CSV to another format unless requested.
