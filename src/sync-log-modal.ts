import { Modal, App } from 'obsidian';
import type { GitHubSyncSettings } from './types';
import { getMoment } from './utils';

export class SyncLogModal extends Modal {
	constructor(
		app: App,
		private settings: GitHubSyncSettings,
		private onClear: () => Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Sync history log" });

		const logs = this.settings.syncLog || [];
		
		if (logs.length === 0) {
			contentEl.createEl("p", { text: "No sync log entries yet.", cls: "ghs-log-empty" });
			return;
		}

		// Create scrollable container
		const container = contentEl.createDiv({ cls: "ghs-log-container" });
		const table = container.createEl("table", { cls: "ghs-log-table" });
		
		const header = table.createEl("tr");
		header.createEl("th", { text: "Time" });
		header.createEl("th", { text: "Host" });
		header.createEl("th", { text: "Mode" });
		header.createEl("th", { text: "Status" });
		header.createEl("th", { text: "Details" });

		// Render logs in reverse chronological order
		for (let i = logs.length - 1; i >= 0; i--) {
			const entry = logs[i];
			if (!entry) continue;
			const row = table.createEl("tr");
			
			// Time
			row.createEl("td", { text: getMoment(entry.timestamp).format("MM-DD HH:mm:ss") });
			
			// Host
			row.createEl("td", { text: entry.hostname || "unknown" });
			
			// Mode
			row.createEl("td", { text: entry.mode });
			
			// Status badge
			const statusTd = row.createEl("td");
			if (entry.error) {
				statusTd.createSpan({ text: "Error", cls: "ghs-badge ghs-badge-error" });
			} else {
				statusTd.createSpan({ text: "Success", cls: "ghs-badge ghs-badge-success" });
			}

			// Details
			const detailsTd = row.createEl("td");
			if (entry.error) {
				detailsTd.createSpan({ text: entry.error, cls: "ghs-log-error-text" });
			} else {
				detailsTd.createSpan({
					text: `↑${entry.uploaded} ↓${entry.downloaded} (conflicts: ${entry.conflicts}, skipped: ${entry.skipped}) - ${entry.duration}ms`,
					cls: "ghs-log-details-text"
				});
			}
		}

		// Add Action Buttons
		const actionDiv = contentEl.createDiv({ cls: "ghs-log-actions" });
		
		// Copy Log Button
		const copyBtn = actionDiv.createEl("button", { text: "Copy logs" });
		copyBtn.addEventListener("click", () => {
			const text = logs.map(e => {
				if (!e) return "";
				const time = getMoment(e.timestamp).format("YYYY-MM-DD HH:mm:ss");
				const status = e.error ? `ERROR: ${e.error}` : `SUCCESS (up:${e.uploaded} down:${e.downloaded} conf:${e.conflicts})`;
				return `[${time}] [${e.hostname}] [${e.mode}] ${status} (${e.duration}ms)`;
			}).filter(t => t.length > 0).join("\n");
			void navigator.clipboard.writeText(text).then(() => {
				copyBtn.setText("Copied!");
				window.setTimeout(() => copyBtn.setText("Copy logs"), 2000);
			});
		});

		// Clear Log Button
		const clearBtn = actionDiv.createEl("button", { text: "Clear log", cls: "mod-warning" });
		clearBtn.addEventListener("click", () => {
			void this.onClear().then(() => {
				this.close();
			});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
