import { App, Notice, TFile } from 'obsidian';
import { GitHubApiClient } from './github-api';
import { GitHubSyncSettings, ConflictInfo } from './types';
import {
	calculateGitSha,
	arrayBufferToBase64,
	generateCommitMessage,
	isTextFile,
	normalizeTextBuffer,
	globToRegex,
	normalizeFilePath,
	getMoment,
} from './utils';
import { ConflictModal } from './conflict-modal';

export interface SyncResult {
	stateChanged: boolean;
	uploaded: number;
	downloaded: number;
	conflicts: number;
	skipped: number;
	duration: number;
}

export class SyncEngine {
	private ignoreRegexes: RegExp[] = [];

	constructor(
		private app: App,
		private settings: GitHubSyncSettings,
		private api: GitHubApiClient,
	) {}

	private getFileFromVault(normalizedPath: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (file instanceof TFile) return file;
		const nfdPath = normalizedPath.normalize('NFD');
		if (nfdPath !== normalizedPath) {
			const nfdFile = this.app.vault.getAbstractFileByPath(nfdPath);
			if (nfdFile instanceof TFile) return nfdFile;
		}
		return null;
	}

	private async getRepoName(): Promise<string> {
		if (
			this.settings.customRepoName &&
			this.settings.customRepoName.trim() !== ''
		) {
			const customRepo = this.settings.customRepoName.trim();
			if (this.settings.authMode === 'auto_classic') {
				await this.api.ensureRepoExists(customRepo);
			}
			return customRepo;
		}

		if (this.settings.authMode === 'auto_classic') {
			const sanitized = this.app.vault
				.getName()
				.toLowerCase()
				.replace(/[^a-z0-9-_]/g, '-')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '');
			if (!sanitized || sanitized.length < 1) {
				throw new Error(
					'Vault name contains only special characters. Please set a custom repository name in settings.',
				);
			}
			const defaultRepo = `obsidian-${sanitized}`;
			await this.api.ensureRepoExists(defaultRepo);
			return defaultRepo;
		}

		throw new Error(
			'Repository name is missing. Please specify one in settings.',
		);
	}

	private isIgnored(path: string): boolean {
		const normPath = normalizeFilePath(path);
		const configDir = this.app.vault.configDir;
		if (normPath.startsWith(`${configDir}/`) || normPath.includes('.trash'))
			return true;

		for (const regex of this.ignoreRegexes) {
			if (regex.test(normPath)) return true;
		}
		return false;
	}

	private async loadIgnoreFile(): Promise<RegExp[]> {
		const ignoreFile = `${this.app.vault.configDir}/.obsidian-sync-ignore`;
		try {
			const content = await this.app.vault.adapter.read(ignoreFile);
			return content
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l.length > 0 && !l.startsWith('#'))
				.map((pattern) => globToRegex(pattern));
		} catch {
			return [];
		}
	}

	async runSync(
		isAuto = false,
		onProgress?: (text: string) => void,
		force = false,
	): Promise<SyncResult> {
		this.ignoreRegexes = await this.loadIgnoreFile();
		const startTime = Date.now();
		let retries = 3;
		while (retries > 0) {
			try {
				const skippedFiles: string[] = [];
				let conflicts = 0;
				const repo = await this.getRepoName();
				const latestCommitSha = await this.api.getLatestCommitSha(repo);
				const remoteTree = await this.api.getTree(
					repo,
					latestCommitSha,
				);

				if (remoteTree.truncated) {
					throw new Error(
						'GitHub remote tree is truncated (exceeds 100k files). Exiting to prevent accidental data loss.',
					);
				}

				const remoteFiles = new Map<string, string>();
				const remoteSizes = new Map<string, number>();
				remoteTree.tree.forEach((item) => {
					if (item.type === 'blob') {
						const normPath = normalizeFilePath(item.path);
						remoteFiles.set(normPath, item.sha);
						remoteSizes.set(normPath, item.size || 0);
					}
				});

				const localFiles = this.app.vault
					.getFiles()
					.filter((f) => !this.isIgnored(normalizeFilePath(f.path)));
				const localHashes = new Map<string, string>();
				const localFileMap = new Map<string, TFile>();

				for (const file of localFiles) {
					const normPath = normalizeFilePath(file.path);
					localFileMap.set(normPath, file);
				}

				if (!this.settings.localHashCache || force) {
					this.settings.localHashCache = {};
				}

				for (const [normPath, file] of localFileMap.entries()) {
					if (file.stat.size > 25 * 1024 * 1024) {
						skippedFiles.push(normPath);
						continue;
					}
					const cache = !force
						? this.settings.localHashCache[normPath]
						: undefined;
					const mtime = file.stat.mtime;
					const size = file.stat.size;

					if (cache && cache.mtime === mtime && cache.size === size) {
						localHashes.set(normPath, cache.sha);
					} else {
						let buffer = await this.app.vault.readBinary(file);
						if (isTextFile(normPath)) {
							buffer = normalizeTextBuffer(buffer);
						}
						const sha = await calculateGitSha(buffer);
						localHashes.set(normPath, sha);
						this.settings.localHashCache[normPath] = {
							mtime,
							size,
							sha,
						};
					}
				}

				// Check and hash unindexed candidates (e.g. root dotfiles like .gitignore, .gitattributes)
				const unindexedCandidates = new Set<string>();
				for (const path of remoteFiles.keys()) {
					if (!localFileMap.has(path) && !this.isIgnored(path)) {
						unindexedCandidates.add(path);
					}
				}
				for (const path of Object.keys(this.settings.lastSyncState)) {
					const normPath = normalizeFilePath(path);
					if (!localFileMap.has(normPath) && !this.isIgnored(normPath)) {
						unindexedCandidates.add(normPath);
					}
				}
				try {
					const rootListing = await this.app.vault.adapter.list('');
					for (const filePath of rootListing.files) {
						const normPath = normalizeFilePath(filePath);
						if (
							normPath.startsWith('.') &&
							!this.isIgnored(normPath) &&
							!localFileMap.has(normPath)
						) {
							unindexedCandidates.add(normPath);
						}
					}
				} catch {
					// Ignore root listing error
				}

				for (const path of unindexedCandidates) {
					try {
						if (await this.app.vault.adapter.exists(path)) {
							const stat = await this.app.vault.adapter.stat(path);
							if (stat && stat.type === 'file') {
								if (stat.size > 25 * 1024 * 1024) {
									skippedFiles.push(path);
									continue;
								}
								const cache = !force
									? this.settings.localHashCache[path]
									: undefined;
								const mtime = stat.mtime;
								const size = stat.size;

								if (
									cache &&
									cache.mtime === mtime &&
									cache.size === size
								) {
									localHashes.set(path, cache.sha);
								} else {
									let buffer =
										await this.app.vault.adapter.readBinary(
											path,
										);
									if (isTextFile(path)) {
										buffer = normalizeTextBuffer(buffer);
									}
									const sha = await calculateGitSha(buffer);
									localHashes.set(path, sha);
									this.settings.localHashCache[path] = {
										mtime,
										size,
										sha,
									};
								}
							}
						}
					} catch {
						// Ignore unindexed read error
					}
				}

				const allLocalPaths = new Set([
					...localFileMap.keys(),
					...unindexedCandidates,
				]);
				for (const path of Object.keys(this.settings.localHashCache)) {
					if (!allLocalPaths.has(path)) {
						delete this.settings.localHashCache[path];
					}
				}

				// Normalize any existing keys in lastSyncState
				for (const path of Object.keys(this.settings.lastSyncState)) {
					const normPath = normalizeFilePath(path);
					if (normPath !== path) {
						this.settings.lastSyncState[normPath] =
							this.settings.lastSyncState[path]!;
						delete this.settings.lastSyncState[path];
					}
				}

				let stateChanged = false;
				const isFirstSync =
					Object.keys(this.settings.lastSyncState).length === 0 &&
					remoteFiles.size > 0;

				if (isFirstSync) {
					for (const [path, remoteSha] of remoteFiles.entries()) {
						const localSha = localHashes.get(path);
						if (localSha === remoteSha) {
							this.settings.lastSyncState[path] = remoteSha;
						}
					}
				}

				const filesToDownload: string[] = [];
				const filesToUpload: string[] = [];
				const filesToDeleteLocally: string[] = [];
				const filesToDeleteRemotely: string[] = [];
				const changedFileNames: string[] = [];

				const allPaths = new Set([
					...remoteFiles.keys(),
					...localHashes.keys(),
					...Object.keys(this.settings.lastSyncState),
				]);

				for (const path of allPaths) {
					const localFile = localFileMap.get(path);
					const remoteSize = remoteSizes.get(path) || 0;
					const isLocalTooLarge =
						localFile && localFile.stat.size > 25 * 1024 * 1024;
					const isRemoteTooLarge = remoteSize > 25 * 1024 * 1024;

					if (isLocalTooLarge || isRemoteTooLarge) {
						if (!skippedFiles.includes(path)) {
							skippedFiles.push(path);
						}
						continue;
					}

					const remoteSha = remoteFiles.get(path);
					const localSha = localHashes.get(path);
					const baseSha = this.settings.lastSyncState[path];

					if (localSha === remoteSha) {
						if (
							remoteSha &&
							this.settings.lastSyncState[path] !== remoteSha
						) {
							this.settings.lastSyncState[path] = remoteSha;
							stateChanged = true;
						}
						continue;
					}

					if (!localSha && remoteSha) {
						if (baseSha === remoteSha) {
							filesToDeleteRemotely.push(path);
						} else {
							filesToDownload.push(path);
						}
					} else if (localSha && !remoteSha) {
						if (baseSha === localSha) {
							filesToDeleteLocally.push(path);
						} else {
							filesToUpload.push(path);
						}
					} else if (localSha && remoteSha) {
						if (baseSha === localSha && remoteSha !== localSha) {
							filesToDownload.push(path);
						} else if (
							baseSha === remoteSha &&
							localSha !== remoteSha
						) {
							filesToUpload.push(path);
						} else {
							if (isAuto) {
								conflicts++;
								continue;
							}
							if (remoteSha) {
								let localContent: ArrayBuffer;
								let localTimestamp = 0;
								if (localFile) {
									localContent =
										await this.app.vault.readBinary(
											localFile,
										);
									localTimestamp = localFile.stat.mtime;
								} else {
									localContent =
										await this.app.vault.adapter.readBinary(
											path,
										);
									const stat =
										await this.app.vault.adapter.stat(path);
									localTimestamp = stat ? stat.mtime : 0;
								}
								const localLines = new TextDecoder()
									.decode(localContent)
									.split('\n').length;
								let remoteContentPreview = '';
								let remoteLines = 0;
								let remoteTimestamp = 0;
								try {
									const remoteBuffer =
										await this.api.downloadBlob(
											repo,
											remoteSha,
										);
									remoteLines = new TextDecoder()
										.decode(remoteBuffer)
										.split('\n').length;
									if (isTextFile(path)) {
										remoteContentPreview =
											new TextDecoder()
												.decode(remoteBuffer)
												.split('\n')
												.slice(0, 15)
												.join('\n');
									} else {
										remoteContentPreview =
											'[Binary File]';
									}
									remoteTimestamp =
										await this.api.getFileLastModified(
											repo,
											path,
										);
								} catch {
									// ignore download error and proceed with defaults
								}

								let localContentPreview = '';
								if (isTextFile(path)) {
									localContentPreview = new TextDecoder()
										.decode(localContent)
										.split('\n')
										.slice(0, 15)
										.join('\n');
								} else {
									localContentPreview = '[Binary File]';
								}

								const conflictInfo: ConflictInfo = {
									filePath: path,
									localSize: localContent.byteLength,
									localLines,
									remoteSize,
									remoteLines,
									localTimestamp,
									remoteTimestamp,
									localContentPreview,
									remoteContentPreview,
								};
								await this.promptConflictResolution(
									conflictInfo,
									filesToUpload,
									filesToDownload,
								);
								conflicts++;
							}
						}
					}
				}

				for (const path of filesToDeleteLocally) {
					const normalizedPath = normalizeFilePath(path);
					const file = this.getFileFromVault(normalizedPath);
					if (file) {
						await this.app.fileManager.trashFile(file);
					} else if (
						await this.app.vault.adapter.exists(normalizedPath)
					) {
						await this.app.vault.adapter.remove(normalizedPath);
					}
					delete this.settings.lastSyncState[path];
					stateChanged = true;
				}

				const totalDownloads = filesToDownload.length;
				for (let i = 0; i < totalDownloads; i++) {
					const path = filesToDownload[i]!;
					onProgress?.(`Syncing... ${i + 1}/${totalDownloads}`);
					const buffer = await this.api.downloadBlob(
						repo,
						remoteFiles.get(path)!,
					);
					const normalizedPath = normalizeFilePath(path);
					const existingFile = this.getFileFromVault(normalizedPath);
					try {
						if (existingFile instanceof TFile) {
							await this.app.vault.modifyBinary(
								existingFile,
								buffer,
							);
						} else {
							const fileExistsOnDisk =
								await this.app.vault.adapter.exists(
									normalizedPath,
								);
							if (fileExistsOnDisk) {
								await this.app.vault.adapter.writeBinary(
									normalizedPath,
									buffer,
								);
							} else {
								const folders = normalizedPath.split('/');
								folders.pop();
								if (folders.length > 0) {
									await this.ensureDirectoryExists(
										folders.join('/'),
									);
								}
								try {
									await this.app.vault.createBinary(
										normalizedPath,
										buffer,
									);
								} catch (err: unknown) {
									const errMsg =
										err instanceof Error
											? err.message
											: String(err);
									if (
										errMsg
											.toLowerCase()
											.includes('already exists')
									) {
										await this.app.vault.adapter.writeBinary(
											normalizedPath,
											buffer,
										);
									} else {
										throw err;
									}
								}
							}
						}
					} catch (err: unknown) {
						const detail =
							err instanceof Error ? err.message : String(err);
						throw new Error(`Failed writing "${path}": ${detail}`);
					}
					this.settings.lastSyncState[path] = remoteFiles.get(path)!;
					stateChanged = true;
				}

				if (
					filesToUpload.length > 0 ||
					filesToDeleteRemotely.length > 0
				) {
					const treePayload: {
						path: string;
						mode: string;
						type: string;
						sha: string | null;
					}[] = [];

					const totalUploads = filesToUpload.length;
					for (let i = 0; i < totalUploads; i++) {
						const path = filesToUpload[i]!;
						onProgress?.(`Syncing... ${i + 1}/${totalUploads}`);
						const normalizedPath = normalizeFilePath(path);
						const file = this.getFileFromVault(normalizedPath);
						let buffer: ArrayBuffer;
						try {
							if (file instanceof TFile) {
								buffer = await this.app.vault.readBinary(file);
							} else if (
								await this.app.vault.adapter.exists(
									normalizedPath,
								)
							) {
								buffer =
									await this.app.vault.adapter.readBinary(
										normalizedPath,
									);
							} else {
								continue;
							}
							if (isTextFile(path)) {
								buffer = normalizeTextBuffer(buffer);
							}
						} catch (err: unknown) {
							const detail =
								err instanceof Error
									? err.message
									: String(err);
							throw new Error(
								`Failed reading "${path}" for upload: ${detail}`,
							);
						}
						const base64 = arrayBufferToBase64(buffer);
						const newBlobSha = await this.api.uploadBlob(
							repo,
							base64,
						);

						treePayload.push({
							path,
							mode: '100644',
							type: 'blob',
							sha: newBlobSha,
						});
						this.settings.lastSyncState[path] = newBlobSha;
						changedFileNames.push(path.split('/').pop()!);
						stateChanged = true;
					}

					for (const path of filesToDeleteRemotely) {
						treePayload.push({
							path,
							mode: '100644',
							type: 'blob',
							sha: null,
						});
						delete this.settings.lastSyncState[path];
						changedFileNames.push(
							`Deleted: ${path.split('/').pop()}`,
						);
						stateChanged = true;
					}

					const commitMessage = generateCommitMessage(
						this.settings.hostname,
						this.settings.dateTimeFormat,
						changedFileNames,
					);

					await this.api.commit(
						repo,
						commitMessage,
						treePayload,
						remoteTree.sha,
						latestCommitSha,
					);
				}

				if (
					!isAuto ||
					filesToDownload.length > 0 ||
					filesToUpload.length > 0 ||
					skippedFiles.length > 0
				) {
					const duration = ((Date.now() - startTime) / 1000).toFixed(
						1,
					);
					const totalChanged =
						filesToDownload.length + filesToUpload.length;
					let msg = '';

					if (totalChanged <= 5 && totalChanged > 0) {
						msg = 'GitHub sync complete.\n';
						for (const p of filesToDownload) {
							msg += `\u2190 ${p.split('/').pop()}\n`;
						}
						for (const p of filesToUpload) {
							msg += `\u2192 ${p.split('/').pop()}\n`;
						}
						msg = msg.trimEnd();
					} else if (totalChanged > 5) {
						const noteCount = filesToDownload
							.concat(filesToUpload)
							.filter((p) => p.endsWith('.md')).length;
						const imageCount = filesToDownload
							.concat(filesToUpload)
							.filter((p) =>
								/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(
									p,
								),
							).length;
						const otherCount =
							totalChanged - noteCount - imageCount;
						const parts: string[] = [];
						if (noteCount > 0)
							parts.push(
								`${noteCount} note${noteCount > 1 ? 's' : ''}`,
							);
						if (imageCount > 0)
							parts.push(
								`${imageCount} image${imageCount > 1 ? 's' : ''}`,
							);
						if (otherCount > 0)
							parts.push(
								`${otherCount} other file${otherCount > 1 ? 's' : ''}`,
							);
						msg = `GitHub sync complete. ${parts.join(', ')}`;
					} else {
						msg = 'GitHub sync complete. No changes.';
					}

					if (conflicts > 0) {
						msg += `\n\u26a0\ufe0f ${conflicts} conflict${conflicts > 1 ? 's' : ''} resolved.`;
					}
					if (skippedFiles.length > 0) {
						msg += `\n\u26a0\ufe0f Skipped ${skippedFiles.length} file(s) exceeding 25MB limit.`;
					}
					msg += `\n(in ${duration}s)`;
					new Notice(msg);
				}

				if (isFirstSync && filesToDownload.length > 0) {
					new Notice(
						`First sync: Downloaded ${filesToDownload.length} file(s) from remote (no prior sync state).`,
					);
				}

				return {
					stateChanged,
					uploaded: filesToUpload.length,
					downloaded: filesToDownload.length,
					conflicts,
					skipped: skippedFiles.length,
					duration: Date.now() - startTime,
				};
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : String(error);
				if (message.includes('422') && retries > 1) {
					retries--;
					await new Promise((resolve) =>
						window.setTimeout(resolve, 2000),
					);
					continue;
				}
				if (isAuto && message.includes('rate limit')) {
					new Notice(`GitHub sync error: ${message}`, 8000);
				}
				throw error;
			}
		}
		return {
			stateChanged: false,
			uploaded: 0,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			duration: Date.now() - startTime,
		};
	}

	private async promptConflictResolution(
		info: ConflictInfo,
		filesToUpload: string[],
		filesToDownload: string[],
	): Promise<void> {
		return new Promise<void>((resolve) => {
			new ConflictModal(this.app, info, (choice) => {
				if (choice === 'local') {
					filesToUpload.push(info.filePath);
					resolve();
				} else if (choice === 'remote') {
					filesToDownload.push(info.filePath);
					resolve();
				} else if (choice === 'both') {
					const normalizedPath = normalizeFilePath(info.filePath);
					const file = this.getFileFromVault(normalizedPath);
					const extIndex = info.filePath.lastIndexOf('.');
					const base =
						extIndex !== -1
							? info.filePath.slice(0, extIndex)
							: info.filePath;
					const ext =
						extIndex !== -1 ? info.filePath.slice(extIndex) : '';
					const dateStr = getMoment().format('YYYY-MM-DD');
					const conflictPath = normalizeFilePath(
						`${base} (Local Conflict ${dateStr})${ext}`,
					);
					if (file) {
						void this.app.vault
							.rename(file, conflictPath)
							.then(() => {
								filesToDownload.push(info.filePath);
								resolve();
							})
							.catch(() => {
								new Notice(
									`Failed to rename conflict file: ${info.filePath}. Skipping download to preserve local changes.`,
								);
								resolve();
							});
					} else {
						void this.app.vault.adapter
							.rename(normalizedPath, conflictPath)
							.then(() => {
								filesToDownload.push(info.filePath);
								resolve();
							})
							.catch(() => {
								filesToDownload.push(info.filePath);
								resolve();
							});
					}
				}
			}).open();
		});
	}

	private async ensureDirectoryExists(path: string): Promise<void> {
		const folders = path.split('/');
		let currentPath = '';
		for (const folder of folders) {
			if (currentPath) {
				currentPath = currentPath + '/' + folder;
			} else {
				currentPath = folder;
			}
			const normalized = normalizeFilePath(currentPath);
			const abstractFile = this.getFileFromVault(normalized);
			const existsOnDisk = abstractFile
				? true
				: await this.app.vault.adapter.exists(normalized);
			if (!abstractFile && !existsOnDisk) {
				try {
					await this.app.vault.createFolder(normalized);
				} catch {
					// Ignore error if it was created concurrently
				}
			}
		}
	}
}
