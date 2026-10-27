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
		});

		if (response.status === 403) {
			const reset = response.headers['x-ratelimit-reset'];
			if (reset) {
				const resetMs = Number(reset) * 1000;
				const waitMin = Math.max(0, Math.ceil((resetMs - Date.now()) / 60000));
				throw new Error(`GitHub API rate limited. Resuming in ~${waitMin} minute${waitMin === 1 ? '' : 's'}.`);
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
				return 'GitHub rejected the request (422). This may be a merge conflict — retry the sync.';
			default:
				return `GitHub API error [${status}]: ${body}`;
		}
	}

	async ensureRepoExists(repo: string): Promise<void> {
		try {
			await this.request(`/repos/${this.username}/${repo}`);
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : String(e);
			if (message.includes('404')) {
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
			if (e instanceof GitHubApiError && e.status === 404) {
				try {
					// Check if repo actually exists (if it doesn't exist, this throws 404)
					await this.request(`/repos/${this.username}/${repo}`);
					
					// Repo exists, but branch heads/branch does not exist. Initialize it.
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
				} catch {
					throw e;
				}
			}
			throw e;
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
			const commits = await this.request(`/repos/${this.username}/${repo}/commits?path=${encodeURIComponent(path)}&page=1&per_page=1`) as { commit: { committer: { date: string } } }[];
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
