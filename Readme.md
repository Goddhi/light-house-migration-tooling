# Lighthouse Migration CLI

A CLI tool to migrate files from Google Drive and AWS S3 to [Lighthouse](https://lighthouse.storage/)

## ✨ Features

### Google Drive Migration
- **OAuth 2.0 Authentication** - Secure authentication with automatic token refresh
- **Secure Token Storage** - Tokens stored in OS keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Folder Selection** - Migrate specific folders or your entire drive
- **File Selection** - Choose individual files to migrate
- **Smart Filtering** - Filter by file type, size, and more
- **Browse & Search** - List and search folders/files before migrating
- **Progress Tracking** - Real-time upload progress with CIDs
- **Analyze Mode** - Dry-run to preview what will be migrated

### AWS S3 Migration
- Migrate entire S3 buckets to Lighthouse
- Concurrent uploads for faster migration
- Prefix-based filtering
- Detailed statistics and reporting

---

## Prerequisites

- **Node.js** 18 or higher
- **Lighthouse API Key** - Get one at [files.lighthouse.storage](https://files.lighthouse.storage/)
- **Google Account** (for Google Drive migration)
- **AWS Credentials** (for S3 migration)

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/Goddhi/light-house-migration-tooling
cd light-house-migration-tooling

# Install dependencies
npm install

# Build the project
npm run build

# Link CLI globally
npm link
```

### Setup

1. **Create Google OAuth Credentials:**

   Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Create a new project (or select existing)
   - Enable Google Drive API
   - Create OAuth 2.0 Client ID → Choose "Desktop app" type
   - Download or copy your Client ID and Client Secret

2. **Configure environment variables:**

   Create a `.env` file in the project root:

   ```bash
   LIGHTHOUSE_API_KEY=your_lighthouse_api_key_here
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   ```

   You can also copy from the example:
   ```bash
   cp .env.example .env
   # Then edit .env with your actual credentials
   ```

3. **Authenticate with Google Drive:**

   ```bash
   lh auth init
   ```

   This will:
   - Open your browser automatically
   - Ask you to grant permissions to your OAuth app
   - Store tokens securely in your OS keyring
   - Support automatic token refresh

4. **Start migrating:**

   ```bash
   # Analyze your drive first
   lh migrate drive --analyze

   # Migrate everything
   lh migrate drive
   ```

---

## Commands Reference

### Authentication Commands

#### `lh auth init`
Initialize authentication with Google Drive.

```bash
lh auth init                    # Quick setup (recommended)
lh auth init --device           # Use device flow (for headless servers)
lh auth init --force            # Force re-authentication
```

#### `lh auth status`
Check authentication status and token information.

```bash
lh auth status
```

Output:
```
Status:       ✔ Authenticated
Email:        your-email@gmail.com
Storage:      OS Keyring (secure)
Token info:   ✔ Valid (45 minutes remaining)
```

#### `lh auth logout`
Logout and delete stored tokens.

```bash
lh auth logout                  # With confirmation
lh auth logout --force          # Skip confirmation
lh auth logout --no-revoke      # Don't revoke with Google
```

---

### Browse Commands

#### `lh list folders`
List all folders in your Google Drive.

```bash
lh list folders                 # Tree view
lh list folders --flat          # Flat list view
lh list folders --search "Photos"  # Search by name
```

Example output:
```
📁 My Drive (root)
├── 📁 Documents
│      ID: 1abc123xyz
├── 📁 Photos
│      ID: 1def456uvw
└── 📁 Projects
       ID: 1ghi789rst
```

#### `lh list files`
List files in Google Drive.

```bash
lh list files                           # List files from root
lh list files --folder 1abc123xyz       # List from specific folder
lh list files --extension pdf           # Filter by extension
lh list files --search "report"         # Search by filename
lh list files --limit 20                # Limit results
```

Example output:
```
1. 📄 document.pdf
   Size: 2.5 MB
   ID:   1xyz789abc123

2. 📄 photo.jpg
   Size: 1.2 MB
   ID:   1uvw456def789
```

---

### Migration Commands

#### `lh migrate drive`
Migrate files from Google Drive to Lighthouse.

**Basic Usage:**
```bash
lh migrate drive                        # Migrate entire drive
lh migrate drive --analyze              # Dry-run (no upload)
lh migrate drive 1abc123xyz             # Migrate specific folder
```

**Selection Options:**
```bash
# Migrate specific folders
lh migrate drive --folders 1abc123,1def456

# Migrate specific files
lh migrate drive --files 1xyz789,1uvw456

# Filter by file type
lh migrate drive --include pdf,jpg,png
lh migrate drive --exclude tmp,log

# Combine filters
lh migrate drive \
  --folders 1abc123 \
  --include pdf \
  --max 100 \
  --analyze
```

**All Options:**
| Option | Description | Example |
|--------|-------------|---------|
| `--analyze` | Preview without uploading | `--analyze` |
| `--max <MB>` | Max file size in MB (default: 50) | `--max 100` |
| `--folders <ids>` | Comma-separated folder IDs | `--folders 1abc,1def` |
| `--files <ids>` | Comma-separated file IDs | `--files 1xyz,1uvw` |
| `--include <exts>` | Only these file types | `--include pdf,jpg` |
| `--exclude <exts>` | Exclude these file types | `--exclude tmp,log` |
| `--exclude-folders <ids>` | Exclude specific folders | `--exclude-folders 1abc` |

---

## 📝 Complete Workflow Examples

### Example 1: Migrate Specific Folder

```bash
# Step 1: Find the folder you want
lh list folders --search "Documents"

# Output shows:
# 📁 Documents
#    ID: 1abc123xyz

# Step 2: Analyze it first
lh migrate drive --folders 1abc123xyz --analyze

# Step 3: Migrate it
lh migrate drive --folders 1abc123xyz
```

### Example 2: Migrate Only PDFs

```bash
# List all PDFs first
lh list files --extension pdf

# Migrate only PDFs from specific folder
lh migrate drive --folders 1abc123xyz --include pdf
```

### Example 3: Migrate Individual Files

```bash
# Step 1: List files from a folder
lh list files --folder 1abc123xyz

# Step 2: Copy the IDs you want
# Step 3: Migrate those specific files
lh migrate drive --files 1xyz789,1uvw456,1rst012
```

### Example 4: Complex Filtering

```bash
# Migrate PDFs and images under 100MB from two folders,
# excluding any backup files
lh migrate drive \
  --folders 1abc123,1def456 \
  --include pdf,jpg,png,gif \
  --exclude bak,tmp \
  --max 100 \
  --analyze
```

---

## 🪣 AWS S3 Migration

### Setup

Set your AWS credentials:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export LIGHTHOUSE_API_KEY=your_lighthouse_key
```

### Usage

```bash
# Analyze bucket
lh-s3 my-bucket --region us-east-1 --analyze

# Migrate entire bucket
lh-s3 my-bucket --region us-east-1

# Migrate with prefix
lh-s3 my-bucket --region us-east-1 --prefix uploads/

# Concurrent uploads
lh-s3 my-bucket --region us-east-1 --concurrency 8

# Limit file size
lh-s3 my-bucket --region us-east-1 --max 200
```

---


### Environment Variables

Create a `.env` file in the project root:

```env
# Required: Your Lighthouse API key
# Get one at: https://files.lighthouse.storage/
LIGHTHOUSE_API_KEY=your_lighthouse_api_key_here

# Required: Google OAuth credentials for Drive access
# Create these at: https://console.cloud.google.com/apis/credentials
# → Create OAuth 2.0 Client ID → Desktop app type
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

**Note:** The `.env` file is gitignored for security. Never commit credentials to git!


