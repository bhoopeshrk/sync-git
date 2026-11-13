// Offline test harness: transpiles the real src/*.ts with TypeScript and runs it
// against an in-memory vault and a fake GitHub API. No Obsidian, network or tokens.
const fs = require('node:fs'),
	path = require('node:path'),
	vm = require('node:vm'),
	ts = require('typescript');
const { webcrypto } = require('node:crypto');
class TFile {
	constructor(path, buffer) {
		this.path = path;
		this.buffer = buffer;
		this.stat = { size: buffer.byteLength, mtime: 1 };
	}
}
let choice = 'both';
class ConflictModal {
	constructor(app, info, cb) {
		this.cb = cb;
	}
	open() {
		this.cb(choice);
	}
}
const modules = {};
const obsidian = {
	TFile,
	Notice: class {},
	normalizePath: (p) => p.replace(/\\/g, '/'),
	moment: () => ({ format: () => '2026-11-10' }),
};
function load(name) {
	if (modules[name]) return modules[name];
	const exports = {};
	const code = ts.transpileModule(
		fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8'),
		{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
	).outputText;
	const requireMock = (id) =>
		id === 'obsidian'
			? obsidian
			: id === './utils'
				? load('utils')
				: id === './types'
					? load('types')
					: id === './conflict-modal'
						? { ConflictModal }
						: (() => {
								throw Error('Unexpected import ' + id);
							})();
	vm.runInNewContext(
		code,
		{
			exports,
			require: requireMock,
			TextEncoder,
			TextDecoder,
			crypto: webcrypto,
			Error,
			console,
			window: {
				btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
				setTimeout: (f) => {
					f();
					return 0;
				},
			},
		},
		{ filename: name + '.js' },
	);
	return (modules[name] = exports);
}
const Engine = load('sync-engine').SyncEngine;
const buf = (s) => new TextEncoder().encode(s).buffer;
const hash = load('utils').calculateGitSha;
async function setup({
	local = {},
	remote = {},
	base = {},
	ignore = '',
	unindexed = [],
	renameFails = false,
	readFails = [],
} = {}) {
	const disk = new Map(
		Object.entries(local).map(([p, s]) => [
			p,
			new TFile(p, typeof s === 'string' ? buf(s) : s),
		]),
	);
	const blobs = new Map(),
		tree = new Map();
	for (const [p, s] of Object.entries(remote)) {
		const b = typeof s === 'string' ? buf(s) : s,
			sha = await hash(b);
		tree.set(p, sha);
		blobs.set(sha, b);
	}
	const settings = {
		authMode: 'manual_fine_grained',
		customRepoName: 'synthetic',
		lastSyncState: {},
		localHashCache: {},
		hostname: 'offline',
		dateTimeFormat: '',
	};
	for (const [p, s] of Object.entries(base)) settings.lastSyncState[p] = await hash(buf(s));
	const log = [];
	const adapter = {
		read: async () => ignore,
		list: async () => ({ files: [...disk.keys()].filter((p) => !p.includes('/')) }),
		exists: async (p) => disk.has(p),
		stat: async (p) => (disk.has(p) ? { ...disk.get(p).stat, type: 'file' } : null),
		readBinary: async (p) => {
			if (readFails.includes(p)) throw Error('synthetic read error');
			return disk.get(p).buffer;
		},
		writeBinary: async (p, b) => {
			disk.set(p, new TFile(p, b));
			log.push(['write', p]);
		},
		remove: async (p) => {
			disk.delete(p);
			log.push(['remove', p]);
		},
		rename: async (p, q) => {
			if (renameFails) throw Error('synthetic rename error');
			disk.set(q, disk.get(p));
			disk.get(q).path = q;
			disk.delete(p);
		},
	};
	const vault = {
		configDir: '.obsidian',
		adapter,
		getFiles: () => [...disk.values()].filter((f) => !unindexed.includes(f.path)),
		getAbstractFileByPath: (p) => (unindexed.includes(p) ? null : disk.get(p)),
		readBinary: async (f) => f.buffer,
		modifyBinary: async (f, b) => {
			f.buffer = b;
			f.stat = { mtime: 2, size: b.byteLength };
			log.push(['modify', f.path]);
		},
		createBinary: async (p, b) => {
			if (disk.has(p)) throw Error('already exists');
			disk.set(p, new TFile(p, b));
			log.push(['create', p]);
		},
		createFolder: async () => {},
		rename: async (f, q) => adapter.rename(f.path, q),
	};
	const api = {
		getLatestCommitSha: async () => 'head',
		getTree: async () => ({
			sha: 'tree',
			truncated: false,
			tree: [...tree].map(([path, sha]) => ({
				path,
				sha,
				type: 'blob',
				size: blobs.get(sha).byteLength,
			})),
		}),
		downloadBlob: async (_, s) => blobs.get(s),
		getFileLastModified: async () => 0,
		uploadBlob: async (_, s) => {
			const b = Uint8Array.from(Buffer.from(s, 'base64')).buffer,
				sha = await hash(b);
			blobs.set(sha, b);
			return sha;
		},
		commit: async (_r, _m, payload) => {
			log.push(['commit', payload]);
			for (const item of payload) {
				if (item.sha === null) tree.delete(item.path);
				else tree.set(item.path, item.sha);
			}
		},
	};
	const engine = new Engine(
		{
			vault,
			fileManager: {
				trashFile: async (f) => {
					disk.delete(f.path);
					log.push(['trash', f.path]);
				},
			},
		},
		settings,
		api,
	);
	return {
		engine,
		settings,
		api,
		disk,
		tree,
		blobs,
		log,
		text: (p) => new TextDecoder().decode(disk.get(p)?.buffer),
	};
}
module.exports = {
	setup,
	load,
	buf,
	hash,
	setChoice: (c) => {
		choice = c;
	},
};
