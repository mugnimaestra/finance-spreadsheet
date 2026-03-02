# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

Static data repository containing an expense tracker CSV template for import into Google Sheets. No application code exists.

## Build, Lint, and Test Commands

None. This repository has no build system, linters, or tests.

## Repository Structure

- `expense-tracker-template.csv` - Primary data template with sample expense entries
- `SETUP-INSTRUCTIONS.txt` - Google Sheets import guide and configuration steps
- `AGENTS.md` - Detailed data schema, validation rules, and editing guidelines
- `instructions.md` - GCP setup guide for google-docs-mcp MCP server

## Key Rules

See `AGENTS.md` for comprehensive data entry and quality rules. Critical points:

**CSV Schema (column order is fixed):**
`Timestamp,Date,Category,Subcategory,Description,Merchant/Store,Amount,Payment Method,Meal Type,Notes`

**Data Formatting:**
- Timestamp: ISO 8601 `YYYY-MM-DDTHH:MM:SS`
- Date: ISO 8601 `YYYY-MM-DD`, must match Timestamp date
- Amount: Two decimal places, dot separator, positive for expenses
- Save as UTF-8 with LF line endings

**Approved Categories:** Food & Dining, Transportation, Housing & Utilities, Subscriptions, Shopping, Health, Entertainment, Education, Work/Business, Other

**Payment Methods:** Cash, Credit Card, Debit Card, E-Wallet, Bank Transfer

**Meal Types (food entries only):** Breakfast, Lunch, Dinner, Snack
