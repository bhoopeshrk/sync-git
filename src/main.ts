import { Plugin, Platform, Notice, moment, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS, GitHubSyncSettings } from './types';
import { GitHubSyncSettingTab } from './settings';
import { GitHubApiClient } from './github-api';
import { SyncEngine } from './sync-engine';
import { SyncLogModal } from './sync-log-modal';

export default class GitHubSyncPlugin extends Plugin {
	settings!: GitHubSyncSettings;
	syncEngine!: SyncEngine;
	statusBarEl!: HTMLElement;
	private syncIntervalId: number | null = null;
	private syncing = false;
	private lastLeafChange = 0;

	async onload() {
		await this.loadSettings();
		if (!this.settings.hostname) {
			this.settings.hostname = Platform.isDesktop
				? 'Desktop'
				: Platform.isIosApp
					? 'iOS'
					: 'Android';
			await this.saveSettings();
		}

		this.initEngine();

		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar(this.canSync() ? 'offline' : 'needs-setup');

		this.addSettingTab(new GitHubSyncSettingTab(this.app, this));

		this.addRibbonIcon(
			'git-compare',
			'GitHub sync',
			() => void this.triggerSync(),
		);
		this.addCommand({
			id: 'sync-now',
			name: 'Sync now',
			callback: () => void this.triggerSync(),
		});
		this.addCommand({
			id: 'force-sync',
			name: 'Force sync (ignore local cache)',
			callback: () => void this.triggerSync(false, true),
		});
		this.addCommand({
			id: 'sync-log',
			name: 'View sync log',
			callback: () => void this.openSyncLog(),
		});
		this.addCommand({
			id: 'clear-sync-log',
			name: 'Clear sync log',
			callback: () => void this.clearSyncLog(),
		});

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.autoPullOnStartup && this.canSync())
				void this.triggerSync(true);
			this.setupScheduler();
		});

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				if (
					!this.settings.autoSyncEnabled ||
					this.settings.syncFrequencyMinutes === 0
				)
					return;
				const now = Date.now();
				if (now - this.lastLeafChange < 5000) return;
				this.lastLeafChange = now;
				const elapsed = now - this.settings.lastSyncTime;
				const threshold =
					this.settings.syncFrequencyMinutes * 60 * 1000;
				if (elapsed > threshold && this.canSync()) {
					void this.triggerSync(true);
				}
			}),
		);
	}

	initEngine() {
		const api = new GitHubApiClient(
			this.settings.personalAccessToken,
			this.settings.githubUsername,
			this.settings.githubApiUrl || 'https://api.github.com',
		);
		this.syncEngine = new SyncEngine(this.app, this.settings, api);
	}

	canSync(): boolean {
		return Boolean(
			this.settings.personalAccessToken && this.settings.githubUsername,
		);
	}

	async triggerSync(isAuto = false, force = false) {
		if (this.syncing) return;
		if (isAuto && typeof navigator !== 'undefined' && !navigator.onLine) {
			this.updateStatusBar('offline');
			return;
		}
		if (!this.canSync()) {
			this.updateStatusBar('needs-setup');
			if (!isAuto)
				new Notice(
					'GitHub sync: Please configure your token and username.',
				);
			return;
		}
		this.syncing = true;
		this.updateStatusBar('syncing');
		const startTimestamp = Date.now();
		try {
			if (!isAuto) {
				new Notice(
					force
						? 'Force syncing with GitHub (ignoring local cache)...'
						: 'Syncing with GitHub...',
				);
			}
			const result = await this.syncEngine.runSync(
				isAuto,
				(text) => {
					this.updateStatusBar('syncing', text);
				},
				force,
			);
			this.settings.lastSyncTime = Date.now();
			await this.saveSettings();
			if (result.conflicts > 0) {
				this.updateStatusBar('error', `${result.conflicts} conflict${result.conflicts > 1 ? 's' : ''} detected. Run manual sync.`);
			} else {
				this.updateStatusBar('idle');
			}

			const entry = {
				timestamp: Date.now(),
				hostname: this.settings.hostname,
				mode: isAuto ? ('auto' as const) : ('manual' as const),
				uploaded: result.uploaded,
				downloaded: result.downloaded,
				conflicts: result.conflicts,
				skipped: result.skipped,
				duration: result.duration,
			};
			this.settings.syncLog.push(entry);
			if (this.settings.syncLog.length > 50) {
				this.settings.syncLog = this.settings.syncLog.slice(-50);
			}
			await this.saveSettings();
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : String(error);
			this.updateStatusBar('error', message);
			if (!isAuto) new Notice(`GitHub sync error: ${message}`, 8000);

			const entry = {
				timestamp: Date.now(),
				hostname: this.settings.hostname,
				mode: isAuto ? ('auto' as const) : ('manual' as const),
				uploaded: 0,
				downloaded: 0,
				conflicts: 0,
				skipped: 0,
				duration: Date.now() - startTimestamp,
				error: message,
			};
			this.settings.syncLog.push(entry);
			if (this.settings.syncLog.length > 50) {
				this.settings.syncLog = this.settings.syncLog.slice(-50);
			}
			await this.saveSettings();
		} finally {
			this.syncing = false;
		}
	}

	updateStatusBar(
		status: 'idle' | 'syncing' | 'error' | 'offline' | 'needs-setup',
		detail = '',
	) {
		if (!this.statusBarEl) return;
		const dateStr =
			this.settings.lastSyncTime > 0
				? moment(this.settings.lastSyncTime).format('HH:mm:ss')
				: 'Never';

		this.statusBarEl.empty();
		this.statusBarEl.className = 'status-bar-item plugin-sync-git'; // reset classes
		this.statusBarEl.onclick = null;

		const iconEl = this.statusBarEl.createSpan({ cls: 'ghs-status-icon' });
		const textEl = this.statusBarEl.createSpan({ cls: 'ghs-status-text' });

		if (Platform.isMobile) {
			textEl.addClass('ghs-status-text-hidden');
		} else {
			textEl.removeClass('ghs-status-text-hidden');
		}

		switch (status) {
			case 'needs-setup':
				setIcon(iconEl, 'alert-circle');
				textEl.setText(' GitHub sync');
				this.statusBarEl.addClass('ghs-status-needs-setup');
				this.statusBarEl.title =
					'Not configured \u2014 click to open settings';
				this.statusBarEl.onclick = () => {
					void this.openSettings();
				};
				break;
			case 'idle':
				setIcon(iconEl, 'cloud');
				textEl.setText(' Synced');
				this.statusBarEl.addClass('ghs-status-idle');
				this.statusBarEl.title = `GitHub sync: Up to date.\nLast sync: ${dateStr}\nClick to sync now`;
				this.statusBarEl.onclick = () => {
					void this.triggerSync(false);
				};
				break;
			case 'syncing':
				setIcon(iconEl, 'refresh-cw');
				iconEl.addClass('ghs-spin');
				textEl.setText(' Syncing...');
				this.statusBarEl.addClass('ghs-status-syncing');
				this.statusBarEl.title = 'GitHub sync: Sync in progress...';
				break;
			case 'offline':
				setIcon(iconEl, 'cloud-off');
				textEl.setText(' Offline');
				this.statusBarEl.addClass('ghs-status-offline');
				this.statusBarEl.title =
					'GitHub sync: Device is offline. Click to view log.';
				this.statusBarEl.onclick = () => {
					this.openSyncLog();
				};
				break;
			case 'error':
				setIcon(iconEl, 'alert-triangle');
				textEl.setText(' Sync error');
				this.statusBarEl.addClass('ghs-status-error');
				this.statusBarEl.title = `GitHub sync: Sync failed.\nError: ${detail}\nClick to view log`;
				this.statusBarEl.onclick = () => {
					this.openSyncLog();
				};
				break;
		}
	}



	setupScheduler() {
		if (this.syncIntervalId) window.clearInterval(this.syncIntervalId);
		if (this.settings.syncFrequencyMinutes > 0) {
			this.syncIntervalId = window.setInterval(
				() => void this.triggerSync(true),
				this.settings.syncFrequencyMinutes * 60 * 1000,
			);
		}
	}

	onunload() {
		if (this.syncIntervalId) window.clearInterval(this.syncIntervalId);
	}

	private openSettings() {
		// Obsidian internal API for opening settings — not in public types
		const app = this.app as unknown as {
			setting?: { open: () => void; openTabById?: (id: string) => void };
		};
		app.setting?.open();
		app.setting?.openTabById?.(this.manifest.id);
	}

	private openSyncLog() {
		new SyncLogModal(this.app, this.settings, this.clearSyncLog.bind(this)).open();
	}

	private async clearSyncLog() {
		this.settings.syncLog = [];
		await this.saveSettings();
		new Notice('Sync log cleared.');
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<GitHubSyncSettings>,
		);
		const tokenKey = 'sync-git-token-' + this.app.vault.getName();
		const securedToken = this.app.loadLocalStorage(tokenKey) as
			| string
			| null;
		if (securedToken) {
			this.settings.personalAccessToken = securedToken;
		} else if (this.settings.personalAccessToken) {
			this.app.saveLocalStorage(
				tokenKey,
				this.settings.personalAccessToken,
			);
		}

		await this.ensureIgnoreFile();
	}

	private async ensureIgnoreFile(): Promise<void> {
		const ignorePath = `${this.app.vault.configDir}/.obsidian-sync-ignore`;
		try {
			await this.app.vault.adapter.read(ignorePath);
		} catch {
			const defaults = [
				'# Files to exclude from GitHub sync',
				'# One pattern per line. Lines starting with # are comments.',
				'workspace.json',
				'workspace-mobile.json',
				'app.json',
				'hotkeys.json',
				'.trash',
			].join('\n');
			await this.app.vault.adapter.write(ignorePath, defaults);
		}
	}

	async saveSettings(_force?: boolean) {
		const tokenKey = 'sync-git-token-' + this.app.vault.getName();
		const token = this.settings.personalAccessToken;
		if (token) {
			this.app.saveLocalStorage(tokenKey, token);
		} else {
			this.app.saveLocalStorage(tokenKey, null);
		}

		const settingsCopy = { ...this.settings };
		delete (settingsCopy as Record<string, unknown>).personalAccessToken;
		await this.saveData(settingsCopy);
	}

	reinitEngine() {
		this.initEngine();
	}

	restartScheduler() {
		this.setupScheduler();
	}
}
