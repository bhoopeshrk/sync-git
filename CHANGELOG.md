# Changelog

All notable changes to SyncGit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- **A folder renamed or deleted on another device no longer stays behind
  empty.** Git stores files, not folders, so a renamed folder reaches this
  device only as "these files were deleted, these were added". The files
  moved, but the old folder was kept, and the vault showed both names. After
  a sync deletes files, the folders it emptied are now removed too, using the
  same trash setting as deleted files. A folder is removed only when it is
  completely empty: a folder that still holds any file - including hidden or
  ignored files the vault does not show - is kept, and empty folders the sync
  did not touch are left alone.

## 1.5.0 - 2026-11-18

### Fixed

- **A note skipped because it changed during a sync is now reported.** When
  the re-check before a deletion found that the file had changed, the sync
  correctly kept the file but recorded nothing - the status bar could say
  "Synced" while an upload was still pending. Skipped deletes now show up as
  skipped files with their own completion notice, like every other per-file
  outcome. (#31)
- **One unreadable file no longer stops the whole sync.** A read failure
  during the re-check that guards an overwrite or a deletion aborted the
  entire sync, while a read failure during the scan was already handled
  per file. Both now behave the same way: the file is left untouched and
  reported as unreadable, and the rest of the vault still syncs. (#31)
- **Switching away from a repository and back no longer loses its sync
  history.** The comparison base was discarded when the target repository
  changed (issue #25), so on an A to B to A round trip a file deleted on A
  while on B looked brand new and was uploaded again. The base is now kept
  per repository, bounded to the five most recently used repositories:
  returning to a previously synced repository restores its base and keeps
  deletions working, while a repository that was never synced still starts
  empty and deletes nothing. Settings written by 1.4.0 keep their state -
  it is migrated into the per-repository map on the next sync. (#31)

### Added

- Regression tests for the path that was left uncovered by 1.4.0: what
  happens after an ignore rule is removed (`tests/ignore-remote.test.cjs`),
  plus the new re-check outcomes (`tests/recheck-outcomes.test.cjs`) and
  per-repository state (`tests/repo-states.test.cjs`). The suite is now 141
  tests, and every one of these fails without its fix. (#31)

## 1.4.0 - 2026-11-18

### Fixed

- **Ignore rules now apply to the remote side as well.** Patterns were only
  applied to the local file list, so a path ignored on this device still
  reached the comparison against the repository with no local copy and a
  matching base - the "deleted locally" case. The deletion was committed to
  GitHub and then followed by every other device. The same gap let files
  excluded by the built-in `.obsidian/` rule be downloaded over local ones.
  Ignored paths are now dropped from the remote file list and from the saved
  sync state before the comparison, so they are never uploaded, downloaded or
  deleted. Removing a pattern later starts from a clean base instead of a
  stale one: if both sides still differ, the file goes through the normal
  conflict flow rather than being silently overwritten. (#24)
- **Recursive ignore patterns match correctly.** `**` was translated to
  `.*` and then rewritten again by the single-`*` rule into `.[^/]*`, and
  `/**/` required at least one directory. `private/**/*.md` therefore never
  matched `private/note.md`. Glob patterns now follow the usual semantics:
  `**` matches any number of directories, including none, and a leading
  `**/` matches at any depth. (#26)
- **Changing the target repository no longer reuses the old sync state.**
  The comparison base was kept when the repository, GitHub user or API URL
  changed. Against the new repository a file that existed locally and in the
  old base but not remotely looked like "deleted remotely" and was moved to
  the trash - deleting local notes on every device. The sync now records
  which repository the state was recorded for and starts a fresh comparison
  when it changes: nothing is deleted on the switch, differences are
  reported as conflicts, and an existing installation without that record
  keeps its state. (#25)
- **A note edited while a sync is running is no longer overwritten.** Which
  files to download or delete was decided from a snapshot taken at the start
  of the sync, and the download loop wrote the remote bytes without looking
  at the local file again. An edit made during the download - or while a
  conflict dialog was open - was silently destroyed. The local file is now
  re-read immediately before it is written or deleted. A download that raced
  is kept as it is, counted as an unresolved conflict and resolved by the
  next sync; a local deletion that raced is left alone and uploaded instead.
  (#23)

### Added

- Offline regression tests for all four fixes (`npm test`, now 129 tests),
  each of which fails on the unfixed code: `tests/glob-recursive.test.cjs`,
  `tests/ignore-remote.test.cjs`, `tests/repo-switch.test.cjs` and
  `tests/overwrite-race.test.cjs`.

### Credits

All four issues in this release were reported by @Morgulisan, together with
a fix for each one, in pull requests #27 to #30.

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

### Added
- Offline regression tests (`npm test`) that run the real plugin sources
  against an in-memory vault and a fake GitHub API, without Obsidian, a
  network connection or a token.

### Credits

All eight issues in this release were reported by @Morgulisan, together with
a fix for each one. The root cause analysis and the fixes are the substance of
this release; the pull requests #14 to #21 are credited in the release notes.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
