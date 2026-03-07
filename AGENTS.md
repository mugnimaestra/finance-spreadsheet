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

### Shared Secrets

The following secrets must be synchronized between the Cloudflare Worker and the VPS:

| Secret | Cloudflare Worker | VPS .env | Purpose |
|--------|-------------------|----------|---------|
| `WEBHOOK_SECRET` | `wrangler secret put WEBHOOK_SECRET` | `WEBHOOK_SECRET=<value>` in `.env` | Authenticates webhook callbacks from VPS → Cloudflare Worker |
| `AI_SERVICE_TOKEN` | Set in Worker secrets | Must match `API_TOKEN` in VPS `.env` | Authenticates API requests from Worker → VPS |

If webhooks return 401 Unauthorized, the most likely cause is a mismatched or missing `WEBHOOK_SECRET`.

To rotate the WEBHOOK_SECRET:
1. Generate a new secret: `openssl rand -hex 32`
2. Set on VPS: `bash expense-ai-service/scripts/set-webhook-secret.sh <new-secret>`
3. Set on Worker: `cd telegram-bot-cloudflare && npx wrangler secret put WEBHOOK_SECRET`

### VPS Service Stability

The service runs as a **user-level systemd unit** (not root). Key stability settings:

- **Linger**: `loginctl enable-linger mugnimaestra` is **required** and enabled.
  Without linger, user services die when the last SSH session closes.
  Verify with: `loginctl show-user mugnimaestra -p Linger` (must be `yes`).
- **Restart policy**: `Restart=always` with `RestartSec=5` — auto-restarts on any exit.
- **Restart rate limit**: `StartLimitBurst=5` / `StartLimitIntervalSec=60` — max 5 restarts per minute.
- **Memory cap**: `MemoryMax=512M` — protects the 1.9 GiB VPS from OOM.
- **V8 heap cap**: `NODE_OPTIONS=--max-old-space-size=384` — secondary memory guard.
- **Service enabled**: `systemctl --user is-enabled expense-ai-service` → `enabled`.

Common troubleshooting:
- Service killed with SIGKILL (status=9) → check linger, check VPS memory with `free -h`.
- Service not starting after reboot → verify linger and `systemctl --user is-enabled`.
- OOM → reduce concurrent OpenCode processes (already limited to 1 in code).

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

- **Current Model**: `opencode/big-pickle` (free model)
- **Custom Agent**: `general-opus` (claude-opus-4.6 via GitHub Copilot)
- **Provider**: OpenCode (free) → GitHub Copilot (delegated)
- **Config Location**: `~/.config/opencode/opencode.json` (VPS)

To change the model, edit the `AI_MODEL` environment variable in the `.env` file on VPS.

The agent wrapper pattern:
- Uses free `chutes/MiniMaxAI/MiniMax-M2.5-TEE` model which delegates to `@general-opus`
- The `general-opus` subagent uses Claude Opus for actual expense extraction
- Toggle: Set `OPENCODE_AGENT_WRAPPER=false` to disable wrapper and use model directly

### Integration with Telegram Bot
The expense tracking feature is exposed via the `telegram-bot-cloudflare` project, allowing users to:
- Send expense messages like "Makan siang warteg 25rb cash"
- Send receipt photos for automatic extraction
- Confirm and save expenses to Google Sheets

### KV Eventual Consistency (Fixed 2026-03-06)

Cloudflare KV is eventually consistent — writes may not be visible to reads from
other edge locations for up to 60 seconds. This caused a bug where pressing
"Konfirmasi" immediately after OCR processing showed "No data to save".

Mitigations applied:
- Session TTL extended from 5 to 15 minutes (handles slow VPS processing).
- Webhook handler (`handleExpenseWebhook.ts`) creates a fallback session via
  `setSession()` when `setPendingExpense()` fails; gates the confirmation UI
  behind a `kvWriteSucceeded` flag.
- Callback handler (`handleExpenseCallback.ts`) retries KV reads 3× with 1.5s
  delays when `pendingExpense` is missing.
- `userId` metadata now propagates through the full async pipeline:
  Telegram Bot → VPS job queue → webhook callback.

If KV consistency issues recur, consider migrating session state to Durable Objects.

## Out of scope
- Do not add personal financial data.
- Do not add proprietary data or credentials.
- Avoid converting the CSV to another format unless requested.
