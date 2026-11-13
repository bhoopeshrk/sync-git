# Changelog

All notable changes to SyncGit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.3.0 - 2026-11-13

### Fixed

- **Files that cannot be read are no longer deleted from the repository.** A
  file outside the Obsidian index (a root dotfile such as `.gitignore`, or a
  file that is not indexed yet) was inspected through the vault adapter, and
  any error was ignored. The file was then treated as missing locally, so the
  sync deleted it from the repository - and from every other device - even
  though it was still on disk. The same happened to unindexed files larger
  than 25 MB. The sync now fails closed per file: such a file is left
  untouched, keeps its previous sync state and is retried on the next sync,
  while the rest of the vault still syncs. The affected files are listed in
  the sync notice and the sync log. (#8)
- **Binary files are no longer corrupted on upload.** Every file whose
  extension was not on a short list of binary formats - and every file
  without an extension - was decoded as UTF-8, which replaced every invalid
  byte sequence and uploaded the damaged result. Formats such as `.heic`,
  `.avif`, `.mov`, `.webm`, `.epub` and `.odt` were silently damaged, and
  other devices then downloaded the damaged copy. Such files are now
  uploaded byte for byte. Ordinary text is still normalized to LF line
  endings, UTF-8 byte order marks are kept, and UTF-16 files are preserved
  unchanged. (#9)
- **A failed upload or commit no longer marks local edits as synced.** The
  sync state was recorded while the commit was still being sent. When the
  upload or the commit failed, the next sync believed the local edits had
  been pushed and downloaded the older remote version over them, or
  resurrected a file that had been deleted locally. The state is now
  recorded only after the commit succeeded, so a failure is retried instead
  of losing work. (#6)
- **"Keep both" no longer overwrites the local copy when the rename fails.**
  Choosing "Keep both" renames the local file before downloading the remote
  version. When the rename failed - for a name collision, a locked file or a
  permission error - the download was queued anyway and the remote content
  overwrote the only surviving copy of the local changes. The download is
  now skipped, the conflict stays unresolved and is reported as such. (#7)
- **Periodic sync stops when "Auto sync enabled" is turned off.** The
  scheduler only looked at the sync frequency, never at the "Auto sync
  enabled" setting, so the interval kept running and kept pushing the vault
  to GitHub after the user believed background syncing had been switched
  off. User initiated syncs are unaffected. (#10)
- **HTTP errors are now reported correctly.** The API client let Obsidian
  throw on every failed request, which made all of its own error handling
  unreachable: "invalid token", "permission denied" and the rate limit
  messages never appeared, and a missing repository was detected by
  searching the error text for "404". Errors are now classified by their
  status code, a 403 is only reported as a rate limit when the quota is
  really exhausted, and error bodies are shortened and stripped of anything
  that looks like a token before they are shown. (#12)
- **The status bar and the sync log now reflect what actually happened.**
  Conflicts that were resolved in the dialog were still shown as an error,
  a sync that skipped files was reported as a success, a manual sync
  requested while a sync was running was ignored without any feedback, the
  status bar said "offline" before anything had been checked, and the
  progress text was never displayed. (#11)

### Changed

- Paths that merely *contain* `.trash` - such as `ideas.trash.md`,
  `project.trashcan.md` or `archive.trash/note.md` - are synced again. Only
  an actual `.trash` folder is excluded, as before. These files were
  silently left out of the sync until now. (#13)
- The setting **"Auto pull on startup"** is now called **"Auto sync on
  startup"**, because it runs a full bidirectional sync, including uploads
  and deletions. The stored setting key is unchanged, so existing
  installations keep their configuration. (#11)
- The local hash cache is rebuilt once, because the hashing rules changed.
  Only files whose bytes really changed are uploaded again - which also
  repairs copies that were already corrupted on the remote. Files that are
  corrupted on every device cannot be repaired by the plugin; restore those
  from an earlier commit in the repository. (#9)
- A repository whose default branch is not `main` is no longer given a
  silently created `main` branch. The sync now stops with a message asking
  for the default branch to be renamed, because SyncGit syncs to `main`. (#12)
- The status bar can now show "Not checked" (nothing synced yet in this
  session) and "Partially synced" (some files were not synced), and the sync
  log distinguishes "Unresolved conflicts" and "Partial" from "Success".
  (#11)

### Credits

All eight issues in this release were reported by @Morgulisan, together with
a fix for each one. The root cause analysis and the fixes are the substance of
this release; the pull requests #14 to #21 are credited in the release notes.

### Added
- Offline regression tests (`npm test`) that run the real plugin sources
  against an in-memory vault and a fake GitHub API, without Obsidian, a
  network connection or a token.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
