# Usage guide

This document provides a comprehensive guide to installing, configuring, and using SyncGit across desktop, iOS, and Android devices.

---

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open Obsidian **Settings**.
2. Navigate to **Community plugins** and ensure **Restricted mode** is disabled.
3. Select **Browse** and search for **SyncGit**.
4. Select **Install**, then select **Enable**.

You can also install directly via the Obsidian URI: [Install SyncGit](obsidian://show-plugin?id=sync-git).

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/bhoopeshrk/sync-git/releases/latest).
2. Create the directory `<Vault>/.obsidian/plugins/sync-git/`.
3. Copy all three downloaded files into that directory.
4. Reload Obsidian and enable **SyncGit** in **Settings → Community plugins**.

---

## Authentication modes

SyncGit offers two setup modes. Choose the mode that fits your workflow and security preferences.

### Automatic (Classic PAT) — recommended

Best for users syncing multiple vaults or looking for a one-click setup. The plugin automatically creates and manages a private GitHub repository for your vault.

1. Go to **Settings → SyncGit**.
2. Set **Setup mode** to **Automatic (recommended)**.
3. Enter your **GitHub username**.
4. Generate a classic Personal Access Token with the `repo` scope:
   - Use the pre-configured link in settings: [Generate pre-configured token](https://github.com/settings/tokens/new?scopes=repo&description=Obsidian%20Sync%20Auto).
5. Paste the token into **Personal access token (classic)**.
6. *(Optional)* Provide a **Custom repository name** if you want to override the default `obsidian-<vault-name>`.
7. Select **Test connection** to verify connectivity, then start syncing.

### Manual (Fine-Grained PAT) — high security

Best for users who prefer strict, repo-scoped permissions or corporate security policies.

1. Create a private repository on GitHub: [github.com/new](https://github.com/new).
2. Generate a fine-grained Personal Access Token: [GitHub Settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new):
   - Set **Repository access** to **Only select repositories**, choosing the repo you created.
   - Under **Permissions → Repository permissions**, set **Contents** to **Read and write**.
3. In Obsidian, go to **Settings → SyncGit** and set **Setup mode** to **Manual / high-security**.
4. Enter your **GitHub username** and the exact **Target repository name**.
5. Paste your token into **Personal access token (fine-grained)**.
6. Select **Test connection** to confirm access.

---

## Security and token visibility

- **Token storage:** Your Personal Access Token is stored securely in Obsidian's device-local `localStorage`. It is **never** written to `data.json` or committed to your vault repository.
- **Show/hide token:** Select the eye icon next to any token input field to toggle between masked (`password`) and readable text.
- **Mobile responsiveness:** Token inputs expand to fill available width on mobile devices for easy editing.

---

## Settings reference

### Authentication

| Setting | Description |
| :--- | :--- |
| **Setup mode** | Choose **Automatic (recommended)** or **Manual / high-security**. |
| **GitHub username** | Your GitHub handle (e.g. `octocat`). |
| **Personal access token** | Classic token (`ghp_...`) or Fine-Grained token (`github_pat_...`). |
| **Custom / Target repository name** | Name of the GitHub repository to sync with. |
| **Connection test** | Select **Test connection** to validate credentials and repository permissions against the GitHub API. |

### Sync schedule

| Setting | Description |
| :--- | :--- |
| **Auto pull on startup** | Automatically pull remote changes when Obsidian opens. |
| **Auto sync enabled** | Periodically commit local changes and pull remote updates. |
| **Sync frequency** | Choose the background sync interval (Every 1, 5, 15, 30, 60 minutes, 12 hours, 24 hours, or Disabled). |

### Advanced

| Setting | Description |
| :--- | :--- |
| **Device hostname** | Identifier for this machine in commit logs (e.g. `MacBook-Pro`, `Work-iPad`). Defaults to `Desktop`, `iOS`, or `Android`. |
| **GitHub API URL** | Base API URL (default: `https://api.github.com`). Set a custom URL when using self-hosted GitHub Enterprise instances. |
| **Ignored patterns** | Interactive tag list of path patterns excluded from sync. |

---

## Ignore patterns

Files matching ignore patterns are excluded from upload and download.

### Managing patterns in settings

You can add or remove ignore patterns directly within **Settings → SyncGit → Ignored patterns**:
- Type a glob pattern (e.g. `*.log`, `private/`, `.trash/`) in the input box and select **Add**.
- Select the **✕** button on any pattern tag to remove it.

### Using `.obsidian-sync-ignore`

Patterns are persisted in `<Vault>/.obsidian/.obsidian-sync-ignore`. You can also edit this file directly:

```text
# Exclude trash and temporary files
.trash/
*.tmp
*.log

# Exclude specific workspace state
.obsidian/workspace.json
```

---

## Commands

Open the command palette (`Ctrl/Cmd + P`) and search for **GitHub sync**:

| Command | ID | Description |
| :--- | :--- | :--- |
| **Sync now** | `sync-git:sync-now` | Runs a standard two-way sync (fetches remote updates, commits local modifications). |
| **Force sync (ignore local cache)** | `sync-git:force-sync` | Invalidates the local hash cache, re-reads all vault files directly from disk, and reconciles state with remote. |
| **View sync log** | `sync-git:sync-log` | Opens a modal displaying the last 50 sync operations with timestamps, change counts, and error details. |
| **Clear sync log** | `sync-git:clear-sync-log` | Clears all stored sync log history. |

---

## Status bar

The status bar item indicates live sync status and allows quick manual sync:

| Status Indicator | Meaning |
| :--- | :--- |
| **⚡ GitHub sync** | Plugin needs configuration. Click to open SyncGit settings. |
| **☁️ Synced** / **Idle** | Vault is up to date with the remote repository. |
| **🔄 Syncing... [x/y]** | Sync is actively transferring files. |
| **💤 Offline** | No network connection detected; background sync is suspended. |
| **⚠️ [Error message]** | Last sync encountered an issue. Hover to view the error message, or check the sync log. |

*Note: On mobile screens, the status bar displays a compact icon to save space.*

---

## Conflict resolution

When a file is modified on multiple devices before syncing, SyncGit displays an interactive three-way conflict modal with:
- File path
- Local vs remote file size and line counts
- Modification timestamps
- Side-by-side content previews for text files

### Resolution options

- **Keep local:** Uploads your local file, overwriting the remote version.
- **Keep remote:** Downloads the remote file, replacing your local copy.
- **Keep both:** Keeps your local version by renaming it to `<filename> (Local Conflict YYYY-MM-DD).<ext>` and downloads the remote version.

---

## Cross-platform & mobile support

SyncGit is designed for seamless synchronization between **Windows**, **macOS**, **Linux**, **iOS**, and **Android**:

- **Unicode normalization:** Automatically handles differences between Windows/Linux (NFC) and macOS/iOS (NFD) to prevent filename collision issues with accented or multibyte (e.g. Japanese, Chinese) characters.
- **Dotfile handling:** Repository dotfiles (such as `.gitignore`, `.gitattributes`, `.editorconfig`) are handled safely through direct filesystem adapters, avoiding mobile vault index collisions.
- **Large file safety:** Files larger than 25 MB are automatically skipped during sync to prevent GitHub REST API blob size failures.

---

## Troubleshooting

### "Please configure your token and username"
- Open **Settings → SyncGit** and ensure your GitHub username and Personal Access Token are saved.
- Select **Test connection** to verify that the credentials are valid.

### Mobile sync fails with "File already exists"
- This occurred in versions prior to 1.2.1 when syncing vaults containing root dotfiles or multibyte characters from desktop.
- Upgrade to **SyncGit 1.2.1** or later.
- Run the command **Force sync (ignore local cache)** to clear any corrupted local comparison cache.

### Changes not syncing
1. Check **Settings → SyncGit → Ignored patterns** to ensure the file path is not matched by an ignore rule.
2. Confirm that the file does not exceed the 25 MB limit.
3. Check the status bar or open the command palette and run **View sync log** to inspect recent errors.

### GitHub API rate limits
- The GitHub REST API allows 5,000 requests per hour for authenticated accounts.
- SyncGit uses delta hashing and skips unmodified files to minimize API consumption.
- If you hit a rate limit, the plugin alerts you; wait a few minutes for the limit window to reset.

### Manual install: plugin does not load
- Ensure the release assets (`main.js`, `manifest.json`, and `styles.css`) are placed directly in `<Vault>/.obsidian/plugins/sync-git/` (not inside a nested subfolder).
- In Obsidian, go to **Settings → Community plugins**, select **Reload plugins**, and enable **SyncGit**.
