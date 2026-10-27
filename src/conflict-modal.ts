import { App, Modal, Setting } from "obsidian";
import { ConflictInfo } from "./types";
import { getMoment } from "./utils";

export class ConflictModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private info: ConflictInfo,
    private resolve: (choice: "local" | "remote" | "both") => void,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    const info = this.info;

    this.modalEl.addClass("ghs-conflict-modal");
    contentEl.createEl("h3", { text: "Sync conflict detected" });
    contentEl.createEl("p", {
      text: `Both you and GitHub modified: ${info.filePath}`,
    });

    const table = contentEl.createEl("table", {
      cls: "conflict-context-table",
    });
    const headerRow = table.createEl("tr");
    headerRow.createEl("th");
    headerRow.createEl("th", { text: "Local" });
    headerRow.createEl("th", { text: "Remote" });

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatTime = (ts: number) => {
      if (ts <= 0) return "unknown";
      const m = getMoment(ts);
      return `${m.fromNow()} (${m.format("YYYY-MM-DD HH:mm")})`;
    };

    const sizeRow = table.createEl("tr");
    sizeRow.createEl("td", { text: "Size" });
    sizeRow.createEl("td", { text: formatSize(info.localSize) });
    sizeRow.createEl("td", { text: formatSize(info.remoteSize) });

    const linesRow = table.createEl("tr");
    linesRow.createEl("td", { text: "Lines" });
    linesRow.createEl("td", { text: String(info.localLines) });
    linesRow.createEl("td", { text: String(info.remoteLines) });

    const timeRow = table.createEl("tr");
    timeRow.createEl("td", { text: "Modified" });
    timeRow.createEl("td", { text: formatTime(info.localTimestamp) });
    timeRow.createEl("td", { text: formatTime(info.remoteTimestamp) });

    if (info.localContentPreview || info.remoteContentPreview) {
      const details = contentEl.createEl("details", { cls: "ghs-conflict-preview-details" });
      details.createEl("summary", { text: "Preview content differences" });
      
      const previewGrid = details.createDiv({ cls: "ghs-conflict-preview-grid" });
      
      const localCol = previewGrid.createDiv({ cls: "ghs-conflict-preview-col" });
      localCol.createEl("strong", { text: "Local content preview" });
      localCol.createEl("pre", { text: info.localContentPreview || "[Empty]" });
      
      const remoteCol = previewGrid.createDiv({ cls: "ghs-conflict-preview-col" });
      remoteCol.createEl("strong", { text: "Remote content preview" });
      remoteCol.createEl("pre", { text: info.remoteContentPreview || "[Empty]" });
    }

    contentEl.createEl("p", { text: "Which version do you want to keep?" });

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("Keep local")
          .setIcon("monitor")
          .onClick(() => {
            this.resolved = true;
            this.resolve("local");
            this.close();
          }),
      )
      .addButton((b) =>
        b
          .setButtonText("Keep remote")
          .setIcon("cloud")
          .onClick(() => {
            this.resolved = true;
            this.resolve("remote");
            this.close();
          }),
      )
      .addButton((b) =>
        b
          .setButtonText("Keep both")
          .setIcon("copy")
          .setCta()
          .onClick(() => {
            this.resolved = true;
            this.resolve("both");
            this.close();
          }),
      );
  }

  onClose() {
    if (!this.resolved) {
      this.resolve("both");
    }
    this.contentEl.empty();
  }
}
