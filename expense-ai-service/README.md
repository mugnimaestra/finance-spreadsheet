# Expense AI Service

HTTP API service that wraps OpenCode CLI for expense data extraction from text and images.

## Overview

This service provides a REST API layer on top of OpenCode CLI, enabling:
- Expense data extraction from natural language text (English/Indonesian)
- Receipt image OCR and parsing
- Google Sheets integration for expense logging

The service uses the `expense-tracker` skill from the `finance-spreadsheet` repository.

## Endpoints

### Health Check
```
GET /health
```
Returns service status. No authentication required.

### Extract from Text
```
POST /api/expense/extract/text
Content-Type: application/json
Authorization: Bearer <token>

{
  "text": "Makan siang warteg 25rb cash",
  "model": "google/gemini-3-flash-preview"  // optional
}
```

Response:
```json
{
  "success": true,
  "expense": {
    "timestamp": "2026-01-27T12:30:00",
    "date": "2026-01-27",
    "category": "Food & Dining",
    "subcategory": "Restaurants",
    "description": "Makan siang",
    "merchant": "Warteg",
    "amount": 25000,
    "paymentMethod": "Cash",
    "mealType": "Lunch",
    "notes": ""
  },
  "confidence": 0.92
}
```

### Extract from Image
```
POST /api/expense/extract/image
Content-Type: application/json
Authorization: Bearer <token>

{
  "imageUrl": "https://example.com/receipt.jpg",
  "model": "google/gemini-3-flash-preview"  // optional
}
```

### Write to Google Sheets
```
POST /api/expense/write
Content-Type: application/json
Authorization: Bearer <token>

{
  "expense": {
    "timestamp": "2026-01-27T12:30:00",
    "date": "2026-01-27",
    "category": "Food & Dining",
    "subcategory": "Restaurants",
    "description": "Makan siang",
    "merchant": "Warteg",
    "amount": 25000,
    "paymentMethod": "Cash",
    "mealType": "Lunch",
    "notes": ""
  }
}
```

## Authentication

All `/api/expense/*` endpoints require Bearer token authentication:
```
Authorization: Bearer <API_TOKEN>
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `API_TOKEN` | Bearer token for authentication | (required) |
| `OPENCODE_MODEL` | AI model for extraction | google/gemini-3-flash-preview |
| `FINANCE_SKILL_PATH` | Path to finance-spreadsheet repo | ~/projects/finance-spreadsheet |

## Development

```bash
# Install dependencies
bun install

# Run in development
bun run src/index.ts

# Run with watch mode
bun --watch src/index.ts
```

## Deployment

### Systemd Service Setup

See `setup-production.sh` for automated setup, or manually:

```bash
# Copy service file
sudo cp expense-ai-service.service /etc/systemd/system/

# Reload and enable
sudo systemctl daemon-reload
sudo systemctl enable expense-ai-service
sudo systemctl start expense-ai-service

# Check status
sudo systemctl status expense-ai-service
```

### Nginx Reverse Proxy

The service runs behind nginx at `opencode-agent.mugnimaestra.dev`:
- HTTP redirects to HTTPS
- SSL via Let's Encrypt
- Proxies to localhost:3001

## Architecture

```
Telegram Bot (Cloudflare Workers)
       │
       ▼
   AI Service (This repo, VPS)
       │
       ├─► OpenCode CLI
       │      │
       │      ▼
       │   expense-tracker skill
       │      │
       │      ▼
       │   google-docs-mcp
       │      │
       │      ▼
       └─► Google Sheets
```

## Related Projects

- **Telegram Bot**: [telegram-bot-cloudflare](https://github.com/user/telegram-bot-cloudflare)
- **Skill Definition**: [finance-spreadsheet/.claude/skills/expense-tracker/](https://github.com/user/finance-spreadsheet)

## Logs

View service logs:
```bash
sudo journalctl -u expense-ai-service -f
```

## Troubleshooting

**"OpenCode not found"**
- Ensure OpenCode is installed: `which opencode`
- Check PATH in systemd service file

**"Authentication failed"**
- Verify API_TOKEN matches the one configured in Telegram bot

**"MCP connection failed"**
- Check google-docs-mcp server is properly configured
- Verify OAuth credentials are valid

**"Skill not found"**
- Ensure FINANCE_SKILL_PATH points to valid finance-spreadsheet clone
- Run `git pull` in finance-spreadsheet to get latest skill
