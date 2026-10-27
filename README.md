# SyncGit

[![Obsidian Community Plugin](https://img.shields.io/badge/Obsidian-Community%20Plugin-7C3AED?logo=obsidian)](https://obsidian.md/plugins?id=sync-git)
[![Latest Release](https://img.shields.io/github/v/release/bhoopeshrk/sync-git?color=blue)](https://github.com/bhoopeshrk/sync-git/releases/latest)

Sync your Obsidian vault across all your devices — desktop, iOS, and Android — using GitHub's REST API. No local Git installation required.

---

## What is this?

SyncGit is a community plugin that keeps your Obsidian vault synchronized across multiple devices using a private GitHub repository as the bridge. It handles three-way conflict resolution, offline detection, and cross-platform line-ending normalization automatically — so you can focus on your notes, not sync logistics.

---

## Features

- **Automatic and manual sync** via ribbon icon or command palette
- **Three-way conflict resolution** with context (file sizes, line counts, timestamps)
- **Offline-aware** — background sync is skipped silently when offline
- **Secure token storage** — Personal Access Token stored in browser `localStorage`, never written to `data.json`
- **Smart delta hashing** — unmodified files are skipped using metadata timestamps
- **Large file protection** — files exceeding 25 MB are automatically skipped
- **Concurrent edit retries** — automatic retry up to 3 times on race conditions
- **Dynamic status bar** — real-time sync state at the bottom of Obsidian
- **Sync log** — view recent sync history with the "View sync log" command
- **GitHub Enterprise support** — configure a custom API base URL

---

## Installation

### From Obsidian Community Plugins (Recommended)

1. Open Obsidian **Settings**.
2. Navigate to **Community plugins** and ensure **Restricted mode** is turned off.
3. Select **Browse** and search for **SyncGit**.
4. Select **Install**, then **Enable**.

You can also open it directly in Obsidian: [Install SyncGit](obsidian://show-plugin?id=sync-git).

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/bhoopeshrk/sync-git/releases/latest).
2. Create the folder `<Vault>/.obsidian/plugins/sync-git/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian and enable the plugin under **Settings → Community plugins**.

---

## Quick start

1. Open **Settings → SyncGit**.
2. Select your **Setup mode** and enter your credentials.
3. Click the ribbon icon (☁️) or run the **Sync now** command.

For detailed setup instructions, authentication modes, commands, and troubleshooting, see **[USAGE.md](USAGE.md)**.

---

## Network disclosure

> **This plugin makes network requests to external services.** As required by [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies):

| Service | URL | Purpose |
| :--- | :--- | :--- |
| **GitHub REST API** | `https://api.github.com` (default) or your custom hostname | Upload, download, and commit vault files to a private GitHub repository |

No analytics, telemetry, or tracking data is collected or transmitted. Vault contents are only transmitted to GitHub as part of the explicit sync operation you control.

---

## Privacy and security

- Your **Personal Access Token** is stored only in browser `localStorage` — it is never written into your vault folder or committed to any repository.
- **Vault file contents** are only ever uploaded to the GitHub repository you configure. They are never sent to any third-party service.
- **Base64 encoding/decoding (`btoa`/`atob`)**: Runtime Base64 conversions are used strictly for communicating with GitHub's Git Blobs REST API (`POST /git/blobs` to upload file bytes and `GET /git/blobs/:sha` to decode downloaded file bytes). No executable code, tokens, URLs, or scripts are obfuscated or dynamically evaluated at runtime.
- The plugin operates entirely offline when no sync is triggered.

---

## License

MIT © Bhoopesh R K
