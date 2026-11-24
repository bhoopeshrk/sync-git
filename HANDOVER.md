# Engineering handover - SyncGit 1.3.0 to 1.6.0 (all closed)

**Repository:** `bhoopeshrk/sync-git` — *Headless cross-platform GitHub sync for Obsidian*
**Status:** Complete. **1.3.0** released 2026-11-13; **1.4.0** and **1.5.0** released 2026-11-18 (1.5.0 ships the follow-ups in section 5 and the per-repository state); **1.6.0** released 2026-11-24 (section 8).
**Scope:** 12 issues (`#6`–`#13`, `#23`–`#26`), 13 pull requests (`#14`–`#21`, `#27`–`#30`, `#32`), two integration PRs (`#22`, and the four-way merge of `#27`–`#30`), plus one follow-up PR (`#31`) closing the items in section 5.
**Reported and fixed by:** @Morgulisan (GitHub id 12633471) for issues `#6`–`#13` and `#23`–`#26`, together with a fix for each; @changstudio (GitHub id 115962957) for the empty-folder fix in `#32`.

> Sections 1–6 are the record of the **1.3.0** release, section 7 the second
> batch (**1.4.0**), and section 8 the third contribution (**1.6.0**). Together
> they record *what was decided*, *what was verified* and *what is still open*
> — not a task list.

---

## 1. Outcome

| Issue | Severity | Fix | Regression test | Status |
| :--- | :--- | :--- | :--- | :--- |
| [#6](https://github.com/bhoopeshrk/sync-git/issues/6) Failed commit marks local edits as synced | P0 data loss | `lastSyncState` is recorded only after `api.commit()` succeeds, so a failed upload or commit is retried instead of being overwritten by the older remote version | `tests/commit-state.test.cjs` | Fixed, closed |
| [#7](https://github.com/bhoopeshrk/sync-git/issues/7) "Keep both" overwrites the local copy | P0 data loss | A failed "keep both" rename no longer queues the download; the conflict stays unresolved and is reported | `tests/keep-both.test.cjs`, `tests/runtime-conflicts.test.cjs` | Fixed, closed |
| [#8](https://github.com/bhoopeshrk/sync-git/issues/8) Unreadable file deleted from the repository | P0 data loss | The sync fails closed per file: the file keeps its previous state and is retried, the rest of the vault still syncs | `tests/unindexed-io.test.cjs` | Fixed, closed |
| [#9](https://github.com/bhoopeshrk/sync-git/issues/9) Binary files corrupted on upload | P0 corruption | Non-text content is uploaded byte for byte; the local hash cache is versioned and rebuilt once | `tests/binary-safe.test.cjs` | Fixed, closed |
| [#10](https://github.com/bhoopeshrk/sync-git/issues/10) Periodic sync runs after auto sync is off | P1 consent | The scheduler gates on the setting and re-checks it in the callback; user initiated syncs are unaffected | `tests/runtime-scheduler.test.cjs` | Fixed, closed |
| [#11](https://github.com/bhoopeshrk/sync-git/issues/11) Status bar and log report wrong outcomes | P2 UX | Unresolved conflicts, skipped files, a busy sync and the startup state are each reported accurately | `tests/runtime-conflicts.test.cjs`, `runtime-busy`, `runtime-progress`, `runtime-skipped`, `runtime-startup` | Fixed, closed |
| [#12](https://github.com/bhoopeshrk/sync-git/issues/12) HTTP error handling unreachable | P1 | Errors are typed and classified by status code; primary and secondary rate limits are told apart | `tests/api-http-errors.test.cjs`, `tests/api-rate-limit-status.test.cjs` | Fixed, closed |
| [#13](https://github.com/bhoopeshrk/sync-git/issues/13) Paths containing `.trash` never synced | P2 | `.trash` is matched as a whole path segment | `tests/engine-trash-paths.test.cjs` | Fixed, closed |

---

## 2. Decisions that could not be made from the code alone

The upstream pull requests left four questions open. They are recorded here because the
reasoning is not visible in the diff.

**#8 — skip the file, do not abort the sync.**
The upstream approach aborted the whole sync, which is safe but lets one locked file stop
the entire vault from syncing. The shipped behaviour fails closed per file: the unreadable
file keeps its previous sync state, is retried on the next sync and is listed in the
notice, the status bar and the sync log. Everything else syncs normally.

**#7 — the two pull requests were merged into one change.**
`#15` stopped the overwrite but still reported the conflict as resolved; `#19` reported
it as unresolved but still overwrote. Neither half is sufficient on its own, and both edit
the same function, so they were implemented together.

**#12 — fail instead of creating a branch.**
Making the error handling reachable also activated previously dead code that creates a
`main` branch when the repository does not have one. For a repository whose default branch
is `master` that would silently fork the user's history and sync the vault to an empty
branch. The sync now stops with a message naming the default branch instead.

**#11 — "partially synced" gets its own styling.**
A partial sync is not a failure. Reusing the error classes made it render identically to
one, so the status bar icon and the log badge use their own warning-coloured classes.

### Hardening beyond the upstream pull requests

- A primary rate limit (quota exhausted) takes precedence over `retry-after`.
- Error bodies are shortened to 200 characters and anything shaped like a personal access
  token is redacted before the body reaches the user or the sync log.
- `formatWait` renders minutes, hours and days instead of a raw minute count.
- `getFileLastModified` is scoped to the branch the plugin actually syncs.

---

## 3. Verification

Every fix is covered by a regression test that **fails on the unfixed code**. This was
re-verified independently by reverting `src/` to the pre-fix state (`e5f7ed2`) and running
the suite:

| Check | Result |
| :--- | :--- |
| `npm test` on `main` | 102 tests, 102 pass, 0 fail |
| `npm test` with `src/` reverted to the pre-fix state | **74 tests fail**, exit code 1 |
| `npm run build` (`tsc --noEmit` + esbuild) | pass |
| `npm run lint` | pass |
| CI on Node 20.x, 22.x and 24.x | build, lint and `npm test` pass |
| Published `main.js` vs. the local build | byte identical (same SHA-256) |

Failing tests per file without the fix:

| Test file | Fail without the fix |
| :--- | ---: |
| `tests/binary-safe.test.cjs` | 16 |
| `tests/api-http-errors.test.cjs` + `tests/api-rate-limit-status.test.cjs` | 19 |
| `tests/runtime-conflicts`, `runtime-busy`, `runtime-progress`, `runtime-skipped`, `runtime-startup`, `keep-both` | 17 |
| `tests/unindexed-io.test.cjs` | 9 |
| `tests/commit-state.test.cjs` | 4 |
| `tests/engine-trash-paths.test.cjs` | 7 |
| `tests/runtime-scheduler.test.cjs` | 2 |
| **Total** | **74** |

The published release artifact was downloaded and inspected: the binary-safe decoder,
`throw: false` on `requestUrl`, the `autoSyncEnabled` gate, the post-commit state write,
the `default_branch` guard, the conflict counters, the `.trash` segment match and the new
CSS classes are all present in the minified bundle.

---

## 4. Corrections to the original work summary

The summary of the 1.3.0 work was checked against the repository and the GitHub API. Four
things in it did not match reality and have since been corrected:

- **The release notes credited a GitHub account that does not exist.** The published notes
  spelled the contributor's handle incorrectly, so the mention did not resolve to their
  account. The release notes have been edited; `CHANGELOG.md` and PR `#22` always used the
  correct handle.
- **The commit history listed a subject that was not in the repository.** The commit that
  fixes issue `#13` has a malformed subject (a single backslash). Correcting it means
  rewriting the published history and moving the released tag. That was judged not worth
  doing for a cosmetic change: the release artifact, the tag tree and every user visible
  behaviour are identical either way, and rewriting published history on a public repository
  carries real risk for no user benefit. **The malformed subject therefore remains in the
  history of `1.3.0`.** It can be corrected in the next release, or left as it is.
- **The "tests that fail without the fix" table was slightly understated.** Two files were
  listed with fewer failures than they actually produce (`binary-safe` 14 → 16,
  `engine-trash-paths` 4 → 7). The correct total is 74, not 69.
- **The verification of `requestUrl({ throw: false })` was done against the installed
  Obsidian typings (1.13.1), not 1.13.0.** The option is public API and `minAppVersion`
  stayed at 1.13.0.

---

## 5. Follow-ups

| Item | Owner | Note |
| :--- | :--- | :--- |
| Plugin listing refresh | automatic | 1.3.0 may take a few hours to appear for users |
| Files corrupted on every device | user | Not repairable by the plugin; restore from an earlier commit. Documented in `CHANGELOG.md` |
| Contributor attribution in the git history | @Morgulisan | The harness commit keeps their authorship. The individual pull requests `#14`–`#21` are closed with a pointer to `#22`; they can be rebased onto `main` and reopened if they want their commits in the history |
| Fragile string matching on error text | backlog | `src/sync-engine.ts` still matches `"422"` and `"rate limit"` on message text; typed errors would be cleaner |
| Issue triage metadata | maintainer | All twelve issues had no type, priority or assignee when they were reported |
| Malformed commit subject | maintainer | The commit that fixes issue `#13` has the subject `\` instead of a real message. Fixing it needs a history rewrite, so it was left alone. Cosmetic only |
| Folder-removal race (1.6.0) | backlog | Between `adapter.list` reporting a folder empty and `trashFile`/`rmdir` acting on it, an externally created file would be trashed with it (`rmdir` throws and keeps it; `trashFile` moves it to the user's trash — recoverable). Microseconds wide, needs a concurrent writer during sync; the folder-level analogue of the file-level re-checks from #30 |
| Empty-folder fix untested on a device (1.6.0) | user | Verified only in the offline harness; the contributor disclosed this in the PR. Worth one manual folder rename on a real vault before trusting it fully |

**Resolved by PR `#31` (2026-11-18):** the four 1.4.0 backlog items below are all
closed — the un-ignore path now has tests, raced deletes are reported through
`skipped`, a re-check read failure is recorded per file instead of aborting the
sync, and the sync state is kept per repository (so a round trip no longer loses
history). One narrower window remains: a *pre*-1.4.0 installation with no
`lastSyncRepo` marker that switches repositories before this version's first sync
cannot have its old state attributed — indistinguishable, and closed by that sync.

---

## 6. Repository notes

- `docs/` and `tasks/` are in `.gitignore` (they have been since the first commit), so
  anything written there is local-only and is **not** shared with the team. This
  handover lives at the repository root for that reason.
- The release workflow now updates an existing release instead of failing when a tag is
  moved, so a rewritten tag no longer breaks a re-publish.
- The eight issues each carry a closing comment pointing at PR `#22` and the changelog.
- The published history of `1.3.0` is intact: no commit was rewritten and the tag still
  points at the commit that was released.

---

## 7. Second batch — released as 1.4.0

Four issues and four pull requests, opened by the same contributor two days after
1.3.0, mapped 1:1 with no overlap. Merged 2026-11-18 in the order #27 → #28 → #29 → #30,
each as a merge commit, so every pull request recorded as merged and its `Closes #N`
keyword closed its issue.

### 7.1 Outcome

| Issue | Severity | Fix | Regression test | Status |
| :--- | :--- | :--- | :--- | :--- |
| [#23](https://github.com/bhoopeshrk/sync-git/issues/23) Edits made during a sync are overwritten | P0 data loss | The local file is re-read immediately before it is written or deleted. A raced download is kept and counted as an unresolved conflict; a raced deletion is left alone and uploaded instead | `tests/overwrite-race.test.cjs` | Fixed, closed |
| [#24](https://github.com/bhoopeshrk/sync-git/issues/24) Ignore rules not applied to remote files | P0 data loss | Ignored paths are dropped from the remote file list and from `lastSyncState` before the comparison, so they are never uploaded, downloaded or deleted | `tests/ignore-remote.test.cjs` | Fixed, closed |
| [#25](https://github.com/bhoopeshrk/sync-git/issues/25) Repository switch reuses old sync state | P0 data loss | `lastSyncRepo` records which repository the state belongs to; a change clears the base so the switch only uploads, downloads or conflicts — never deletes | `tests/repo-switch.test.cjs` | Fixed, closed |
| [#26](https://github.com/bhoopeshrk/sync-git/issues/26) `**` in ignore patterns translated wrongly | P2 | `globToRegex()` rewritten as a single-pass character loop: `**` matches any number of segments including none, and the single-`*` rule no longer rewrites its output | `tests/glob-recursive.test.cjs` | Fixed, closed |

### 7.2 Decisions and verification

- **Merge order.** Any order was textually safe — all six pairs merged clean and the
  four-way merge produced one tree. #27 went first because a wrong glob now also decides
  what is hidden from the remote side, which is what #28 filters.
- **Both agents' predicted conflicts were wrong.** #28 and #29 were expected to collide in
  the `lastSyncState` region of `runSync()`. `git merge-tree` reported clean and the
  merged tree was byte-identical to the pre-tested one (`3fe2211c…`), because #28's
  pruning sits *after* `stateChanged = repoChanged`, so neither flag is lost.
- **Fail-without-fix, re-derived independently:** each PR's tests were run with `src/`
  reverted to `main`. Every one failed (4 each, 16 total) and passed again on restore.
  Control tests passed on `main`, so the tests genuinely discriminate.
- **Combined suite before merging:** 129 tests, 102 of them pre-existing, all passing,
  with `tsc` and `eslint` clean. The same 129 passed on the merged `main`, and CI runs
  54–57 (one per merge commit) were green on Node 20.x, 22.x and 24.x.
- **Fail-closed held under scrutiny:** `readLocalSha()` returns `undefined` only when
  `adapter.exists()` is false, so a read *error* throws rather than being read as
  "deleted" — the delete path can never act on an unknown state.

### 7.3 What was deliberately not done

- **Release notes are generated, then credited.** `.github/workflows/release.yml`
  creates the release with `--generate-notes`; the body is edited afterwards to credit
  the reporter, exactly as was done for 1.3.0, because auto-generated notes cannot
  know who reported the issues.
- **The four issues initially had no closing comments**; the `Closes #N` keyword
  closed them silently. They were added after the release, each pointing at its
  own fixing pull request — the first attempt was posted on the pull requests by
  mistake, deleted, and reposted on the issues.
- **`minAppVersion` stays at `1.13.0`** — no new Obsidian API was used, so
  `versions.json` records `1.4.0 → 1.13.0`.

---

## 8. Third contribution - released as 1.6.0

PR [`#32`](https://github.com/bhoopeshrk/sync-git/pull/32) by **@changstudio**
(GitHub id 115962957), opened 2026-11-23 and merged 2026-11-24 as `a2eb04e`.
It was reported directly as a pull request — no issue exists — and is
SyncGit's first contribution from outside the project. Generated with Claude
Code, disclosed in the PR body.

### 8.1 Outcome

| Change | Regression test | Status |
| :--- | :--- | :--- |
| A folder emptied by a sync (renamed or deleted on another device) is now removed with it — via `fileManager.trashFile` for indexed folders, `adapter.rmdir` for unindexed ones — but only when `adapter.list` shows it completely empty, so hidden/ignored files, folders the sync did not touch, and folders whose deletion was skipped all keep theirs | `tests/empty-folders.test.cjs` (7 tests) | Merged, released |

### 8.2 Decisions and verification

- **Approved the fork's workflow run first.** A first-time contributor's PR sits
  at `action_required` until a maintainer approves; run 64 was green after that.
  (The approve REST endpoint takes the run *id*, not the run *number* — the
  first attempt 404'd on the number.)
- **Teeth re-derived independently:** with `src/` reverted to `5c61591` (1.5.0),
  exactly 3 of the 7 new tests fail — the folder-rename, folder-chain and
  untouched-empty-folder cases — matching the contributor's stated 4 pass / 3
  fail split.
- **The harness change was reviewed as production code**, because it is: the old
  `list()` ignored its directory argument and always returned root files; folders
  now exist as entities, `exists()` recognises them, and writes create parents as
  on a real disk. No existing test file was modified and all 141 pre-existing
  tests pass against it.
- **Combined result:** 148 tests, `tsc` and `eslint` clean, merged tree
  byte-identical to the tested tree (`d5caeaf4…`), CI run 65 green on the merge
  commit.
- **Two follow-ups recorded in section 5** rather than blocking the merge: the
  folder-removal TOCTOU window, and the contributor's own disclosure that the
  fix has not been run on a real device yet.
