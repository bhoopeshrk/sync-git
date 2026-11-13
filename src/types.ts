export type AuthMode = 'auto_classic' | 'manual_fine_grained';

export interface LocalHashCacheItem {
  mtime: number;
  size: number;
  sha: string;
}

/**
 * Version of the hashing/normalization rules used to fill `localHashCache`.
 * Bump it whenever those rules change, so hashes computed under the old
 * rules are recomputed instead of being compared against the remote.
 */
export const LOCAL_HASH_CACHE_VERSION = 1;

export interface ConflictInfo {
  filePath: string;
  localSize: number;
  localLines: number;
  remoteSize: number;
  remoteLines: number;
  localTimestamp: number;
  remoteTimestamp: number;
  localContentPreview?: string;
  remoteContentPreview?: string;
}

export interface SyncLogEntry {
  timestamp: number;
  hostname: string;
  mode: "auto" | "manual";
  uploaded: number;
  downloaded: number;
  conflicts: number;
  skipped: number;
  duration: number;
  error?: string;
}

export interface GitHubSyncSettings {
  authMode: AuthMode;
  githubUsername: string;
  personalAccessToken: string;
  customRepoName: string;
  hostname: string;
  dateTimeFormat: string;
  syncFrequencyMinutes: number;
  autoPullOnStartup: boolean;
  autoSyncEnabled: boolean;
  lastSyncState: Record<string, string>;
  localHashCache: Record<string, LocalHashCacheItem>;
  /** Version of the hash rules the cached hashes were computed with. */
  localHashCacheVersion?: number;
  githubApiUrl: string;
  lastSyncTime: number;
  syncLog: SyncLogEntry[];
}

export const DEFAULT_SETTINGS: GitHubSyncSettings = {
  authMode: 'auto_classic',
  githubUsername: '',
  personalAccessToken: '',
  customRepoName: '',
  hostname: '',
  dateTimeFormat: 'YYYY-MM-DD HH:mm:ss',
  syncFrequencyMinutes: 15,
  autoPullOnStartup: true,
  autoSyncEnabled: true,
  lastSyncState: {},
  localHashCache: {},
  // 0 means "no cache yet": the first sync fills it with the current rules.
  localHashCacheVersion: 0,
  githubApiUrl: 'https://api.github.com',
  lastSyncTime: 0,
  syncLog: [],
};