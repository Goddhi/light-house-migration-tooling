## Lighthouse Drive Migration CLI
A simple CLI tool to migrate files from Google Drive to Lighthouse-web3
It lists files in your Google Drive, filters out Google Docs/Sheets/Slides, and uploads eligible files to Lighthouse using your API key.

###  Features

- Authenticate with your Google account

- Scan your Google Drive (or a specific folder) for files

- Skip Google Workspace files (Docs, Sheets, etc.)

- Optionally skip files over a size limit (default 50 MB)

- Analyze-only mode for reporting counts and file sizes

- Upload eligible files to Lighthouse/IPFS and print their CIDs

### Prerequisites

- Node.js 18+

- A Lighthouse API key

- A Google Cloud OAuth client with Drive API enabled

#### Setup Google OAuth

- Go to Google Cloud Console

- Create a new project (or use an existing one).

- Enable the Google Drive API.

- Create OAuth 2.0 Client ID credentials:

- Application type: Desktop app

- Download the JSON file and save it as credentials.json in the project root.

- The CLI will guide you through authentication on first run and store tokens in token.json.

### Clone and build the CLI:

```
git clone https://github.com/Goddhi/light-house-migrate-google-drive.git
cd lighthouse-drive-migration
npm install
npm run build
npm link    # exposes the `lh` command
```

### Usage
#### Analyze your Drive (no uploads)
```
lh migrate drive --analyze
```

#### Upload files to Lighthouse
```
export LIGHTHOUSE_API_KEY=your_api_key_here
lh migrate drive
```

#### Options
```
lh migrate drive [folderId] [options]

Arguments:
  folderId           Google Drive folder ID (default: root)

Options:
  --analyze          Analyze only; do not upload
  --max <MB>         Max file size in MB (default: 50)
```

### Notes

**Google Workspace files (Docs, Sheets, Slides) cannot be exported in their native formats, so they’re always skipped.**

**Files over the size threshold are also skipped.**

**The first time you run the CLI, it will open a browser window to authenticate with your Google account and create token.json.**