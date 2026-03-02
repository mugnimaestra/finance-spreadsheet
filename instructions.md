# GCP Setup Instructions for google-docs-mcp

Purpose: Guide AI agents in helping users set up Google Cloud Platform credentials
for the [google-docs-mcp](https://github.com/a-bonus/google-docs-mcp) MCP server.

---

## Overview

The google-docs-mcp server requires Google API credentials to access Google Docs,
Sheets, and Drive. There are two authentication methods:

1. **OAuth 2.0 (Desktop App)** - For personal use; requires one-time browser auth
2. **Service Account** - For enterprise/automation; requires Workspace admin access

---

## Prerequisites

- A Google account
- Access to [Google Cloud Console](https://console.cloud.google.com/)
- (For Service Account with delegation) Google Workspace admin access

---

## Method 1: OAuth 2.0 Credentials (Recommended for Personal Use)

### Step 1: Create or Select a GCP Project

**[MANUAL - Requires human interaction]**

1. Open https://console.cloud.google.com and sign in
2. Click the project dropdown at the top of the page
3. Click **"NEW PROJECT"**
4. Enter project details:
   - Project name: `google-docs-mcp` (or any preferred name)
   - Organization: Leave as default or select your organization
5. Click **"CREATE"**
6. Wait for project creation (notification bell will confirm)
7. Select the new project from the dropdown

**Alternative (if gcloud CLI is available):**
```bash
gcloud projects create google-docs-mcp-PROJECT_ID --name="Google Docs MCP"
gcloud config set project google-docs-mcp-PROJECT_ID
```

---

### Step 2: Enable Required APIs

**[MANUAL - or use gcloud CLI]**

#### Via Google Cloud Console:

1. Go to **APIs & Services** > **Library**
2. Search for and enable each API by clicking on it, then clicking **"ENABLE"**:
   - Google Docs API
   - Google Sheets API
   - Google Drive API

#### Via gcloud CLI:

```bash
gcloud services enable docs.googleapis.com
gcloud services enable sheets.googleapis.com
gcloud services enable drive.googleapis.com
```

---

### Step 3: Configure OAuth Consent Screen

**[MANUAL - Cannot be automated, must use browser]**

1. Go to **APIs & Services** > **OAuth consent screen**

2. Select User Type:
   - Choose **"External"** (for personal Google accounts)
   - Choose **"Internal"** (if using Google Workspace and only org users need access)
   - Click **"CREATE"**

3. Fill in App Information (Page 1):
   - App name: `Google Docs MCP Access`
   - User support email: (select your email)
   - Developer contact information: (enter your email)
   - Click **"SAVE AND CONTINUE"**

4. Configure Scopes (Page 2):
   - Click **"ADD OR REMOVE SCOPES"**
   - Find and check these scopes:
     ```
     https://www.googleapis.com/auth/documents
     https://www.googleapis.com/auth/spreadsheets
     https://www.googleapis.com/auth/drive.file
     ```
   - Click **"UPDATE"**
   - Click **"SAVE AND CONTINUE"**

5. Add Test Users (Page 3):
   - Click **"ADD USERS"**
   - Enter the Google email address that will use this server
   - Click **"ADD"**
   - Click **"SAVE AND CONTINUE"**

6. Review Summary (Page 4):
   - Click **"BACK TO DASHBOARD"**

---

### Step 4: Create OAuth 2.0 Client ID

**[MANUAL - Cannot be automated]**

1. Go to **APIs & Services** > **Credentials**
2. Click **"+ CREATE CREDENTIALS"** > **"OAuth client ID"**
3. Configure:
   - Application type: **Desktop app**
   - Name: `MCP Docs Desktop Client`
4. Click **"CREATE"**
5. **Download the credentials:**
   - Click **"DOWNLOAD JSON"** in the dialog
   - Save the file (named `client_secret_XXXXX.json`)
6. Rename and move the file:
   ```bash
   mv ~/Downloads/client_secret_*.json /path/to/mcp-googledocs-server/credentials.json
   ```

---

### Step 5: First-Time Authorization

**[MANUAL - Requires browser interaction]**

1. Navigate to the server directory:
   ```bash
   cd /path/to/mcp-googledocs-server
   ```

2. Run the server:
   ```bash
   node ./dist/server.js
   ```

3. The terminal will display:
   ```
   Authorize this app by visiting this url:
   https://accounts.google.com/o/oauth2/v2/auth?...
   ```

4. Copy the URL and open it in a browser

5. Sign in with the Google account added as a Test User

6. Click **"Allow"** on the consent screen

7. The browser redirects to `http://localhost/?code=XXXXX&scope=...`
   - **The page will show an error - this is expected!**
   - Copy the code from the URL (between `code=` and `&scope`)

8. Paste the code into the terminal and press Enter

9. Verify:
   - Terminal shows: `Authentication successful!`
   - A `token.json` file appears in the project folder

---

## Method 2: Service Account (For Enterprise/Automation)

Use this method for:
- Automated systems without user interaction
- Google Workspace organizations needing domain-wide access
- Accessing documents on behalf of users

### Step 1: Create Service Account

**[MANUAL - or use gcloud CLI]**

#### Via Google Cloud Console:

1. Go to **APIs & Services** > **Credentials**
2. Click **"+ CREATE CREDENTIALS"** > **"Service account"**
3. Fill in:
   - Service account name: `google-docs-mcp-sa`
   - Description: `Service account for google-docs-mcp server`
4. Click **"CREATE AND CONTINUE"**
5. Skip "Grant access" steps, click **"CONTINUE"** then **"DONE"**

#### Via gcloud CLI:

```bash
gcloud iam service-accounts create google-docs-mcp-sa \
    --display-name="Google Docs MCP Service Account" \
    --description="Service account for google-docs-mcp server"
```

---

### Step 2: Create and Download Service Account Key

**[MANUAL - or use gcloud CLI]**

#### Via Google Cloud Console:

1. In Credentials, click on the service account email
2. Go to the **"KEYS"** tab
3. Click **"ADD KEY"** > **"Create new key"**
4. Select **JSON** format
5. Click **"CREATE"**
6. Download and secure the file:
   ```bash
   mv ~/Downloads/*.json /path/to/service-account-key.json
   chmod 600 /path/to/service-account-key.json
   ```

#### Via gcloud CLI:

```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud iam service-accounts keys create service-account-key.json \
    --iam-account=google-docs-mcp-sa@${PROJECT_ID}.iam.gserviceaccount.com
```

---

### Step 3: Choose Access Model

#### Option A: Domain-Wide Delegation (Workspace Only)

**[MANUAL - Requires Workspace Admin]**

Part 1 - Enable on Service Account:
1. Go to **IAM & Admin** > **Service Accounts**
2. Click on your service account
3. Click **"Edit"** (pencil icon)
4. Check **"Enable Google Workspace Domain-wide Delegation"**
5. Save and note the **Client ID** (numeric)

Part 2 - Configure in Workspace Admin:
1. Go to https://admin.google.com
2. Navigate to **Security** > **API Controls** > **Domain-wide Delegation**
3. Click **"Add new"**
4. Enter:
   - Client ID: (the numeric ID from Part 1)
   - OAuth Scopes:
     ```
     https://www.googleapis.com/auth/documents,https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive
     ```
5. Click **"Authorize"**

#### Option B: Share Files With Service Account

**[MANUAL]**

1. Find the service account email in Cloud Console
   (format: `name@project-id.iam.gserviceaccount.com`)
2. Share target Docs/Sheets/Drive folders with this email
3. The agent will only access files explicitly shared

---

### Step 4: Configure Environment Variables

**[CAN BE AUTOMATED]**

For service account setup:
```bash
export SERVICE_ACCOUNT_PATH="/absolute/path/to/service-account-key.json"
```

If using domain-wide delegation:
```bash
export GOOGLE_IMPERSONATE_USER="user@yourdomain.com"
```

Claude Desktop config example:
```json
{
  "mcpServers": {
    "google-docs-mcp": {
      "command": "node",
      "args": ["/path/to/mcp-googledocs-server/dist/server.js"],
      "env": {
        "SERVICE_ACCOUNT_PATH": "/path/to/service-account-key.json",
        "GOOGLE_IMPERSONATE_USER": "user@yourdomain.com"
      }
    }
  }
}
```

---

## Security Guidelines

**Never commit credentials to version control!**

Ensure `.gitignore` includes:
```
credentials.json
token.json
service-account-key.json
```

Set restrictive permissions:
```bash
chmod 600 credentials.json
chmod 600 token.json
chmod 600 service-account-key.json
```

---

## Quick Reference: Automation Limitations

| Step                        | Manual Required | CLI Alternative           |
|-----------------------------|-----------------|---------------------------|
| Create GCP Project          | Yes             | `gcloud projects create`  |
| Enable APIs                 | Yes             | `gcloud services enable`  |
| OAuth Consent Screen        | **Yes (always)**| None                      |
| Create OAuth Client ID      | **Yes (always)**| None                      |
| Download credentials.json   | **Yes (always)**| None                      |
| OAuth Authorization Flow    | **Yes (always)**| None                      |
| Create Service Account      | Yes             | `gcloud iam sa create`    |
| Create SA Key               | Yes             | `gcloud iam sa keys`      |
| Domain-Wide Delegation      | **Yes (always)**| None                      |

---

## Troubleshooting

### "Access Denied" or "Permission Denied"
- Verify all three APIs are enabled
- Check that the user is listed as a Test User (for OAuth)
- Ensure scopes are correctly configured

### "Invalid Grant" Error
- Delete `token.json` and re-authorize
- Verify correct Google account is being used

### "Redirect URI Mismatch"
- Ensure OAuth client type is set to "Desktop app"
- Do not add any redirect URIs for Desktop apps

### Service Account Cannot Access Documents
- Check domain-wide delegation configuration
- Verify scopes in Admin Console match exactly
- Confirm impersonation email is valid

### "This operation is not supported for this document"
- Some converted documents (from Word) have limited API support
- Try with a native Google Doc

---

## Checklist

### OAuth 2.0 (Personal):
- [ ] GCP project created
- [ ] Google Docs API enabled
- [ ] Google Sheets API enabled
- [ ] Google Drive API enabled
- [ ] OAuth consent screen configured
- [ ] Test user added
- [ ] OAuth client ID created (Desktop app type)
- [ ] `credentials.json` downloaded and placed in project folder
- [ ] First-time authorization completed
- [ ] `token.json` generated

### Service Account (Enterprise):
- [ ] GCP project created
- [ ] All three APIs enabled
- [ ] Service account created
- [ ] JSON key downloaded and secured
- [ ] Access model configured (delegation or file sharing)
- [ ] Environment variables set
