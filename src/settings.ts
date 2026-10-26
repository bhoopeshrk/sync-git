import {
	App,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	TextComponent,
	ButtonComponent,
	setIcon,
} from "obsidian";
import type GitHubSyncPlugin from "./main";
import { GitHubApiClient } from "./github-api";

export class GitHubSyncSettingTab extends PluginSettingTab {
	private ignorePatterns: string[] = [];
	private ignoreLoaded = false;

	constructor(
		app: App,
		private plugin: GitHubSyncPlugin,
	) {
		super(app, plugin);
	}

	override getControlValue(key: string): unknown {
		if (key === "syncFrequencyMinutes") {
			return String(this.plugin.settings.syncFrequencyMinutes);
		}
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "syncFrequencyMinutes") {
			const num = parseInt(String(value), 10);
			this.plugin.settings.syncFrequencyMinutes = isNaN(num) ? 0 : num;
		} else {
			(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		}
		await this.plugin.saveSettings(true);
		if (key === "authMode") {
			this.plugin.reinitEngine();
			this.update();
		} else if (
			key === "githubUsername" ||
			key === "customRepoName" ||
			key === "githubApiUrl"
		) {
			this.plugin.reinitEngine();
		} else if (
			key === "syncFrequencyMinutes" ||
			key === "autoSyncEnabled"
		) {
			this.plugin.restartScheduler();
		}
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		const isAutoClassic = () => this.plugin.settings.authMode === "auto_classic";
		const isFineGrained = () => this.plugin.settings.authMode === "manual_fine_grained";

		return [
			{
				type: "group",
				heading: "Authentication",
				items: [
					{
						name: "Setup mode",
						desc: "Choose how you want to manage repository creation and token security.",
						control: {
							type: "dropdown",
							key: "authMode",
							options: {
								auto_classic: "Automatic (recommended)",
								manual_fine_grained: "Manual / high-security",
							},
						},
					},
					{
						name: "Automatic multi-vault instructions",
						visible: isAutoClassic,
						render: (setting: Setting) => {
							setting.settingEl.empty();
							this.renderClassicCallout(setting.settingEl);
						},
					},
					{
						name: "Scoped security instructions",
						visible: isFineGrained,
						render: (setting: Setting) => {
							setting.settingEl.empty();
							this.renderFineGrainedCallout(setting.settingEl);
						},
					},
					{
						name: "GitHub username",
						desc: "Your GitHub account username.",
						control: {
							type: "text",
							key: "githubUsername",
							placeholder: "octocat",
							validate: (v: string) => {
								const val = v.trim();
								if (val.includes(" ")) {
									return "Username cannot contain spaces";
								}
								return undefined;
							},
						},
					},
					{
						name: "Personal access token (classic)",
						desc: "Begins with ghp_...",
						visible: isAutoClassic,
						render: (setting: Setting) => {
							this.renderTokenSetting(setting, "classic");
						},
					},
					{
						name: "Personal access token (fine-grained)",
						desc: "Begins with github_pat_...",
						visible: isFineGrained,
						render: (setting: Setting) => {
							this.renderTokenSetting(setting, "fine-grained");
						},
					},
					{
						name: "Custom repository name",
						desc: "Leave blank to auto-derive from vault name, or specify an existing repo to connect to.",
						visible: isAutoClassic,
						control: {
							type: "text",
							key: "customRepoName",
							placeholder: `obsidian-${this.app.vault.getName().toLowerCase()}`,
							validate: (v: string) => {
								const val = v.trim();
								if (val.includes(" ")) {
									return "Repository name cannot contain spaces";
								}
								return undefined;
							},
						},
					},
					{
						name: "Target repository name",
						desc: "The exact name of the existing GitHub repository.",
						visible: isFineGrained,
						control: {
							type: "text",
							key: "customRepoName",
							placeholder: "my-obsidian-vault",
							validate: (v: string) => {
								const val = v.trim();
								if (val.includes(" ")) {
									return "Repository name cannot contain spaces";
								}
								return undefined;
							},
						},
					},
					{
						name: "Connection test",
						desc: "Verify credentials and connection with GitHub API.",
						render: (setting: Setting) => {
							this.renderTestConnectionSetting(setting);
						},
					},
				],
			},
			{
				type: "group",
				heading: "Sync schedule",
				items: [
					{
						name: "Auto pull on startup",
						desc: "Pull remote changes when Obsidian starts.",
						control: {
							type: "toggle",
							key: "autoPullOnStartup",
						},
					},
					{
						name: "Auto sync enabled",
						desc: "Periodically commit and push local changes on a schedule.",
						control: {
							type: "toggle",
							key: "autoSyncEnabled",
						},
					},
					{
						name: "Sync frequency",
						desc: "How often to sync in the background.",
						control: {
							type: "dropdown",
							key: "syncFrequencyMinutes",
							options: {
								"0": "Disabled",
								"1": "Every 1 minute",
								"5": "Every 5 minutes",
								"15": "Every 15 minutes",
								"30": "Every 30 minutes",
								"60": "Every 1 hour",
								"720": "Every 12 hours",
								"1440": "Every 24 hours",
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: "Advanced",
				items: [
					{
						name: "Device hostname",
						desc: "Identifies this machine in commit logs (e.g. MacBook-Pro, Work-iPad).",
						control: {
							type: "text",
							key: "hostname",
							placeholder: "Desktop",
						},
					},
					{
						name: "GitHub API URL",
						desc: "Default is https://api.github.com. Set a custom URL for self-hosted GitHub Enterprise.",
						control: {
							type: "text",
							key: "githubApiUrl",
							placeholder: "https://api.github.com",
						},
					},
					{
						name: "Ignored patterns",
						desc: "Files matching these patterns won't be synced.",
						render: (setting: Setting) => {
							this.renderIgnorePatternsSetting(setting);
						},
					},
				],
			},
		];
	}

	// ─── Callouts ─────────────────────────────────────────────

	private renderClassicCallout(containerEl: HTMLElement): void {
		const callout = containerEl.createDiv({ cls: "ghs-auth-callout" });
		const titleEl = callout.createDiv({ cls: "ghs-auth-callout-title" });
		const iconSpan = titleEl.createSpan({ cls: "ghs-auth-callout-icon" });
		setIcon(iconSpan, "info");
		titleEl.createEl("strong", { text: " Automatic multi-vault mode:" });
		const list = callout.createEl("ul");
		list.createEl("li", { text: "Creates a private repo matching your vault name automatically." });
		list.createEl("li", {
			text: "Requires a classic personal access token with repository scope.",
		});
		const linkLi = list.createEl("li");
		linkLi.createEl("a", {
			text: "Generate a pre-configured classic token",
			attr: {
				href: "https://github.com/settings/tokens/new?scopes=repo&description=Obsidian%20Sync%20Auto",
				target: "_blank",
			},
		});
	}

	private renderFineGrainedCallout(containerEl: HTMLElement): void {
		const callout = containerEl.createDiv({ cls: "ghs-auth-callout" });
		const titleEl = callout.createDiv({ cls: "ghs-auth-callout-title" });
		const iconSpan = titleEl.createSpan({ cls: "ghs-auth-callout-icon" });
		setIcon(iconSpan, "shield");
		titleEl.createEl("strong", { text: " Scoped security mode:" });
		const list = callout.createEl("ul");
		const step1 = list.createEl("li");
		step1.createEl("a", {
			text: "Create an empty private repository",
			attr: { href: "https://github.com/new", target: "_blank" },
		});
		step1.appendText(" on GitHub first.");
		const step2 = list.createEl("li");
		step2.createEl("a", {
			text: "Generate a fine-grained token",
			attr: { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank" },
		});
		step2.appendText(" scoped only to that repo with ");
		step2.createEl("strong", { text: "Contents: Read & write" });
		step2.appendText(" permissions.");
	}

	// ─── Token Setting ────────────────────────────────────────

	private renderTokenSetting(setting: Setting, mode: "classic" | "fine-grained"): void {
		setting.settingEl.empty();
		setting.settingEl.addClass("ghs-token-setting");

		const label = mode === "classic" ? "Personal access token (classic)" : "Personal access token (fine-grained)";
		const placeholder = mode === "classic" ? "ghp_xxxxxxxxxxxx" : "github_pat_xxxxxxxxxxxx";
		const desc = mode === "classic" ? "Begins with ghp_..." : "Begins with github_pat_...";

		setting.setName(label).setDesc(desc);

		const securedBadge = setting.nameEl.createSpan({ cls: "ghs-secured-badge" });
		setIcon(securedBadge, "lock");
		securedBadge.createSpan({ text: " LocalStorage" });

		setting.addText((t: TextComponent) => {
			t.inputEl.type = "password";
			t.inputEl.addClass("ghs-token-input");
			t.setPlaceholder(placeholder)
				.setValue(this.plugin.settings.personalAccessToken)
				.onChange(async (v: string) => {
					const val = v.trim();
					if (val !== v || v.includes(" ")) {
						t.inputEl.addClass("ghs-input-invalid");
					} else {
						t.inputEl.removeClass("ghs-input-invalid");
					}
					this.plugin.settings.personalAccessToken = val;
					await this.plugin.saveSettings(true);
					this.plugin.reinitEngine();
				});
			const initialVal = this.plugin.settings.personalAccessToken || "";
			if (initialVal.includes(" ")) t.inputEl.addClass("ghs-input-invalid");
		});

		let showToken = false;

		setting.addButton((b: ButtonComponent) => {
			b.setIcon("eye-off")
				.setTooltip("Show token")
				.onClick(() => {
					showToken = !showToken;
					const textInput = setting.settingEl.querySelector(".ghs-token-input");
					if (textInput instanceof HTMLInputElement) {
						textInput.type = showToken ? "text" : "password";
					}
					b.setIcon(showToken ? "eye" : "eye-off");
					b.setTooltip(showToken ? "Hide token" : "Show token");
				});
		});
	}

	// ─── Test Connection ──────────────────────────────────────

	private renderTestConnectionSetting(setting: Setting): void {
		setting.settingEl.empty();
		setting.setName("Connection test").setDesc("Verify credentials and connection with GitHub API.");

		let statusSpan: HTMLSpanElement | null = null;

		setting.addButton((b) => {
			b.setButtonText("Test connection")
				.onClick(async () => {
					b.setDisabled(true);
					if (statusSpan) {
						statusSpan.remove();
					}
					statusSpan = setting.settingEl.createSpan({ cls: "ghs-test-status ghs-test-status-loading" });
					setIcon(statusSpan, "refresh-cw");
					statusSpan.createSpan({ text: " Testing..." });

					const repoName = this.plugin.settings.customRepoName ||
						(this.plugin.settings.authMode === "auto_classic"
							? `obsidian-${this.app.vault.getName().toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}`
							: "");

					const api = new GitHubApiClient(
						this.plugin.settings.personalAccessToken,
						this.plugin.settings.githubUsername,
						this.plugin.settings.githubApiUrl || "https://api.github.com",
					);

					const result = await api.testConnection(repoName);

					statusSpan.remove();
					if (result.success) {
						statusSpan = setting.settingEl.createSpan({ cls: "ghs-test-status ghs-test-status-success" });
						setIcon(statusSpan, "check-circle");
						statusSpan.createSpan({ text: ` ${result.message}` });
					} else {
						statusSpan = setting.settingEl.createSpan({ cls: "ghs-test-status ghs-test-status-error" });
						setIcon(statusSpan, "alert-triangle");
						statusSpan.createSpan({ text: ` Failed: ${result.message}` });
					}
					b.setDisabled(false);
				});
		});
	}

	// ─── Ignore Patterns ──────────────────────────────────────

	private renderIgnorePatternsSetting(setting: Setting): void {
		setting.settingEl.empty();
		const container = setting.settingEl.createDiv({ cls: "ghs-ignore-container" });
		this.renderIgnorePatterns(container);
	}

	private async loadIgnorePatterns(): Promise<void> {
		const ignoreFile = `${this.app.vault.configDir}/.obsidian-sync-ignore`;
		try {
			const content = await this.app.vault.adapter.read(ignoreFile);
			this.ignorePatterns = content
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l.length > 0);
		} catch {
			this.ignorePatterns = [];
		}
		this.ignoreLoaded = true;
	}

	private async saveIgnorePatterns(): Promise<void> {
		const ignoreFile = `${this.app.vault.configDir}/.obsidian-sync-ignore`;
		await this.app.vault.adapter.write(ignoreFile, this.ignorePatterns.join("\n"));
	}

	private renderIgnorePatterns(containerEl: HTMLElement): void {
		if (!this.ignoreLoaded) {
			void this.loadIgnorePatterns().then(() => this.renderIgnorePatterns(containerEl));
			return;
		}

		const patterns = this.ignorePatterns.filter((p) => !p.startsWith("#") && p.length > 0);

		const listDiv = containerEl.createDiv({ cls: "ghs-tag-container" });

		if (patterns.length === 0) {
			listDiv.createDiv({ text: "No ignore patterns configured.", cls: "ghs-ignore-empty" });
		} else {
			for (const pattern of patterns) {
				const tag = listDiv.createDiv({ cls: "ghs-tag" });
				tag.createSpan({ text: pattern, cls: "ghs-tag-label" });
				const removeBtn = tag.createSpan({ cls: "ghs-tag-remove" });
				setIcon(removeBtn, "x");
				removeBtn.addEventListener("click", (e) => {
					e.preventDefault();
					void (async () => {
						const idx = this.ignorePatterns.indexOf(pattern);
						if (idx !== -1) this.ignorePatterns.splice(idx, 1);
						await this.saveIgnorePatterns();
						containerEl.empty();
						this.renderIgnorePatterns(containerEl);
					})();
				});
			}
		}

		const addDiv = containerEl.createDiv({ cls: "ghs-ignore-input-row" });
		const addInput = addDiv.createEl("input", {
			type: "text",
			cls: "ghs-ignore-input",
			attr: { placeholder: "New pattern (e.g. *.log)" },
		});
		const addBtn = addDiv.createEl("button", { cls: "mod-cta" });
		setIcon(addBtn, "plus");
		addBtn.createSpan({ text: " Add" });
		addBtn.addEventListener("click", () => {
			void (async () => {
				const val = addInput.value.trim();
				if (val.length > 0 && !this.ignorePatterns.includes(val)) {
					this.ignorePatterns.push(val);
					await this.saveIgnorePatterns();
					containerEl.empty();
					this.renderIgnorePatterns(containerEl);
				}
			})();
		});
	}
}
