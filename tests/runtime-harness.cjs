// Offline plugin harness: loads src/main.ts and friends with stubbed Obsidian APIs
// so status bar, scheduler and log behaviour can be tested without Obsidian.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
	const notices = [],
		copied = [],
		intervals = [],
		cleared = [],
		modals = [];
	class TFile {
		constructor(p, content = 'BASE') {
			this.path = p;
			this.content = content;
			this.stat = { size: content.length, mtime: 1 };
		}
	}
	class Element {
		constructor() {
			this.children = [];
		}
		empty() {
			this.children = [];
		}
		createSpan(o = {}) {
			const e = new Element();
			e.text = o.text || '';
			this.children.push(e);
			return e;
		}
		createEl(t, o) {
			return this.createSpan(o);
		}
		createDiv(o) {
			return this.createSpan(o);
		}
		addClass() {}
		removeClass() {}
		setText(t) {
			this.text = t;
		}
		addEventListener(type, handler) {
			this.listeners = this.listeners || {};
			(this.listeners[type] = this.listeners[type] || []).push(handler);
		}
	}
	class Modal {
		constructor(app) {
			this.app = app;
			this.contentEl = new Element();
		}
		open() {
			modals.push(this);
		}
		close() {
			this.onClose?.();
		}
	}
	const obsidian = {
		Plugin: class {},
		PluginSettingTab: class {
			constructor(app, plugin) {
				this.app = app;
				this.plugin = plugin;
			}
		},
		Modal,
		TFile,
		Platform: { isMobile: false, isDesktop: true },
		Notice: class {
			constructor(t) {
				notices.push(t);
			}
		},
		setIcon() {},
	};
	const utils = {
		getMoment: () => ({ format: () => '2026-11-10' }),
		normalizeFilePath: (p) => p,
		isTextFile: () => true,
		normalizeTextBuffer: (b) => b,
		calculateGitSha: async (b) => new TextDecoder().decode(b),
		arrayBufferToBase64: () => '',
		generateCommitMessage: () => '',
		globToRegex: (p) => new RegExp(p),
	};
	const cache = {};
	const context = {
		TextEncoder,
		TextDecoder,
		Uint8Array,
		ArrayBuffer,
		Error,
		console,
		AbortController,
		Date,
		navigator: {
			onLine: true,
			clipboard: {
				writeText: async (text) => {
					copied.push(text);
				},
			},
		},
		window: {
			setInterval(fn, ms) {
				intervals.push({ fn, ms });
				return intervals.length;
			},
			clearInterval(id) {
				cleared.push(id);
			},
			setTimeout,
			clearTimeout,
		},
	};
	function load(name) {
		if (cache[name]) return cache[name];
		const module = { exports: {} };
		cache[name] = module.exports;
		const source = fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8');
		const code = ts.transpileModule(source, {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		}).outputText;
		vm.runInNewContext('(function(require,module,exports){' + code + '\n})', context)(
			(id) =>
				id === 'obsidian'
					? obsidian
					: id === './utils'
						? utils
						: id === './github-api'
							? { GitHubApiClient: class {} }
							: load(id.replace('./', '')),
			module,
			module.exports,
		);
		return module.exports;
	}
	function plugin() {
		const P = load('main').default;
		const p = new P();
		p.settings = {
			...load('types').DEFAULT_SETTINGS,
			personalAccessToken: 'synthetic',
			githubUsername: 'offline',
			hostname: 'fixture',
			syncLog: [],
			lastSyncState: {},
			localHashCache: {},
		};
		p.statuses = [];
		p.updateStatusBar = (...a) => p.statuses.push(a);
		p.saveSettings = async () => {};
		return p;
	}
	return {
		load,
		plugin,
		notices,
		copied,
		intervals,
		cleared,
		modals,
		TFile,
		Element,
		context,
		obsidian,
	};
}
module.exports = {
	harness,
	ok: {
		stateChanged: false,
		uploaded: 0,
		downloaded: 0,
		conflicts: 0,
		unresolvedConflicts: 0,
		unreadable: 0,
		skipped: 0,
		duration: 1,
	},
	enc: (s) => new TextEncoder().encode(s).buffer,
};
