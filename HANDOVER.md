# Engineering handover — SyncGit 1.3.0 (closed)

**Repository:** `bhoopeshrk/sync-git` — *Headless cross-platform GitHub sync for Obsidian*
**Status:** Complete. Released as **1.3.0** on 2026-11-13.
**Scope:** 8 issues (`#6`–`#13`), 8 upstream pull requests (`#14`–`#21`), one integration PR (`#22`).
**Reported and fixed by:** @Morgulisan (GitHub id 12633471), together with a fix for each issue.

> This document replaces the pre-release handover, which described all eight issues as
> open. It is the record of *what was decided*, *what was verified* and *what is still
> open* — not a task list.

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
  fixes issue `#13` had a malformed subject (a single backslash). The history was rewritten
  so that only the subject changed — the tree at the release tag is byte identical to the
  published one, so the released artifact is unaffected.
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
| Issue triage metadata | maintainer | The eight issues had no type, priority or assignee when they were reported |
| `backup/pre-message-fix` branch | maintainer | Safety net for the history rewrite. Safe to delete once this is accepted |

---

## 6. Repository notes

- `docs/` and `tasks/` are in `.gitignore` (they have been since the first commit), so
  anything written there is local-only and is **not** shared with the team. This
  handover lives at the repository root for that reason.
- The release workflow now updates an existing release instead of failing when a tag is
  moved, so a rewritten tag no longer breaks a re-publish.
- The eight issues each carry a closing comment pointing at PR `#22` and the changelog.
