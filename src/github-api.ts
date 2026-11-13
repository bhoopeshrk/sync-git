import { requestUrl, RequestUrlParam } from 'obsidian';

interface GitHubRef {
	object: {
		sha: string;
	};
}

interface GitHubBlob {
	content: string;
}

interface GitHubTree {
	sha: string;
	truncated: boolean;
	tree: { type: string; path: string; sha: string; size?: number }[];
}

interface GitHubCommit {
	sha: string;
}

export class GitHubApiError extends Error {
	constructor(public status: number, message: string) {
		super(message);
		this.name = 'GitHubApiError';
	}
}

/**
 * Formats a wait time in minutes for a user facing message.
 */
function formatWait(minutes: number): string {
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
	const hours = Math.ceil(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
	const days = Math.ceil(hours / 24);
	return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Shortens an error body before it is shown to the user, and removes
 * anything that looks like a personal access token.
 */
function summarizeBody(body: string): string {
	const redacted = body
		.replace(
			/\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
			'[redacted]',
		)
		.replace(/\s+/g, ' ')
		.trim();
	if (redacted.length === 0) return '';
	return redacted.length > 200
		? `${redacted.slice(0, 200)}...`
		: redacted;
}

export class GitHubApiClient {
	constructor(private token: string, private username: string, private apiUrl: string) {}

	private async request(endpoint: string, options: Partial<RequestUrlParam> = {}): Promise<unknown> {
		const url = endpoint.startsWith('http') ? endpoint : `${this.apiUrl}${endpoint}`;
		const response = await requestUrl({
			url,
			method: options.method || 'GET',
			headers: {
				'Accept': 'application/vnd.github+json',
				'Authorization': `Bearer ${this.token}`,
				'X-GitHub-Api-Version': '2022-11-28',
				...options.headers,
			},
			body: options.body,
			// Do not let Obsidian throw on HTTP errors: the client classifies
			// them itself, so mapHttpError() and the typed GitHubApiError
			// below are actually reached.
			throw: false,
		});

		if (response.status === 403 || response.status === 429) {
			const remaining = response.headers['x-ratelimit-remaining'];
			const reset = response.headers['x-ratelimit-reset'];
			if (remaining === '0' && reset) {
				// Primary rate limit: the hourly quota is exhausted.
				const resetMs = Number(reset) * 1000;
				const waitMin = Math.max(
					1,
					Math.ceil((resetMs - Date.now()) / 60000),
				);
				throw new Error(
					`GitHub API rate limited. Resuming in ~${formatWait(waitMin)}.`,
				);
			}
			const retryAfter = Number(response.headers['retry-after']);
			if (retryAfter > 0 || /rate limit/i.test(response.text)) {
				// Secondary rate limit: quota is left, the request was
				// throttled for abuse detection or shared limits.
				const waitMin = Math.max(1, Math.ceil((retryAfter || 60) / 60));
				throw new Error(
					`GitHub API rate limited. Resuming in ~${formatWait(waitMin)}.`,
				);
			}
		}
		if (response.status >= 400) {
			throw new GitHubApiError(response.status, this.mapHttpError(response.status, response.text));
		}
		return response.json as unknown;
	}

	private mapHttpError(status: number, body: string): string {
		switch (status) {
			case 401:
				return 'GitHub token is invalid or expired. Update it in plugin settings.';
			case 403:
				return 'Permission denied. Check that your token has the required scopes (repo).';
			case 404:
				return 'Repository not found. Verify the repo name and that your token has access.';
			case 422:
				return 'GitHub rejected the request (422). This may be a merge conflict - retry the sync.';
			default: {
				const detail = summarizeBody(body);
				return detail
					? `GitHub API error [${status}]: ${detail}`
					: `GitHub API error [${status}].`;
			}
		}
	}

	async ensureRepoExists(repo: string): Promise<void> {
		try {
			await this.request(`/repos/${this.username}/${repo}`);
		} catch (e: unknown) {
			if (e instanceof GitHubApiError && e.status === 404) {
				await this.request('/user/repos', {
					method: 'POST',
					body: JSON.stringify({ name: repo, private: true, auto_init: true }),
				});
				await new Promise(res => window.setTimeout(res, 3000));
			} else throw e;
		}
	}
	async getLatestCommitSha(repo: string, branch = 'main'): Promise<string> {
		try {
			const ref = await this.request(`/repos/${this.username}/${repo}/git/ref/heads/${branch}`) as GitHubRef;
			return ref.object.sha;
		} catch (e: unknown) {
			if (!(e instanceof GitHubApiError) || e.status !== 404) throw e;
			// The branch does not exist. Only create it when the repository
			// expects it: silently creating a "main" branch in a repository
			// whose default branch is something else would fork the user's
			// history and sync the vault to an empty branch.
			const info = (await this.request(
				`/repos/${this.username}/${repo}`,
			)) as { default_branch?: string };
			const defaultBranch = info?.default_branch;
			if (defaultBranch && defaultBranch !== branch) {
				throw new GitHubApiError(
					404,
					`Repository "${repo}" has no "${branch}" branch (its default branch is "${defaultBranch}"). SyncGit syncs to the "${branch}" branch: rename the default branch to "${branch}" or choose a different repository.`,
				);
			}
			// The repository exists and expects this branch: initialize it.
			const commit = await this.request(`/repos/${this.username}/${repo}/git/commits`, {
				method: 'POST',
				body: JSON.stringify({
					message: 'Initial commit (SyncGit)',
					tree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
					parents: [],
					}),
			}) as GitHubCommit;

			await this.request(`/repos/${this.username}/${repo}/git/refs`, {
				method: 'POST',
				body: JSON.stringify({
					ref: `refs/heads/${branch}`,
					sha: commit.sha,
				}),
			});
			return commit.sha;
		}
	}
	async getTree(repo: string, treeSha: string): Promise<GitHubTree> {
		return (await this.request(`/repos/${this.username}/${repo}/git/trees/${treeSha}?recursive=1`)) as GitHubTree;
	}

	/**
	 * Downloads a Git blob from GitHub and decodes its Base64 content into binary ArrayBuffer.
	 * Uses window.atob strictly for decoding file payloads received from GET /repos/{owner}/{repo}/git/blobs/{file_sha}.
	 */
	async downloadBlob(repo: string, fileSha: string): Promise<ArrayBuffer> {
		const blob = await this.request(`/repos/${this.username}/${repo}/git/blobs/${fileSha}`) as GitHubBlob;
		const binaryString = window.atob(blob.content.replace(/\n/g, ''));
		const len = binaryString.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	}

	async uploadBlob(repo: string, contentBase64: string): Promise<string> {
		const data = await this.request(`/repos/${this.username}/${repo}/git/blobs`, {
			method: 'POST',
			body: JSON.stringify({ content: contentBase64, encoding: 'base64' }),
		}) as GitHubBlob & { sha: string };
		return data.sha;
	}

	async commit(repo: string, message: string, tree: { path: string; mode: string; type: string; sha: string | null }[], baseTreeSha: string, parentCommitSha: string) {
		const newTree = await this.request(`/repos/${this.username}/${repo}/git/trees`, {
			method: 'POST',
			body: JSON.stringify({ base_tree: baseTreeSha, tree }),
		}) as GitHubTree;
		const commit = await this.request(`/repos/${this.username}/${repo}/git/commits`, {
			method: 'POST',
			body: JSON.stringify({ message, tree: newTree.sha, parents: [parentCommitSha] }),
		}) as GitHubCommit;
		await this.request(`/repos/${this.username}/${repo}/git/refs/heads/main`, {
			method: 'PATCH',
			body: JSON.stringify({ sha: commit.sha, force: false }),
		});
	}

	async testConnection(repo: string): Promise<{ success: boolean; message: string }> {
		try {
			// Verify token validity by requesting user profile
			await this.request('/user');
			
			// If a repository name is specified, verify we have access or if it's new
			if (repo && repo.trim() !== '') {
				try {
					await this.request(`/repos/${this.username}/${repo}`);
				} catch (repoErr) {
					if (repoErr instanceof GitHubApiError && repoErr.status === 404) {
						return { success: true, message: 'Token is valid. Repository does not exist yet and will be created.' };
					}
					throw repoErr;
				}
			}
			return { success: true, message: 'Connection successful!' };
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e);
			return { success: false, message };
		}
	}

	async getFileLastModified(repo: string, path: string): Promise<number> {
		try {
			const commits = await this.request(`/repos/${this.username}/${repo}/commits?path=${encodeURIComponent(path)}&sha=main&page=1&per_page=1`) as { commit: { committer: { date: string } } }[];
			if (commits && commits.length > 0) {
				const firstCommit = commits[0];
				if (firstCommit && firstCommit.commit && firstCommit.commit.committer) {
					return Date.parse(firstCommit.commit.committer.date);
				}
			}
		} catch {
			// ignore
		}
		return 0;
	}
}
