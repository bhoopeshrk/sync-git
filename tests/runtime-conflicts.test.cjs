const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, ok, enc } = require('./runtime-harness.cjs');

function findByText(element, text) {
	if (!element) return null;
	if (element.text === text) return element;
	for (const child of element.children || []) {
		const found = findByText(child, text);
		if (found) return found;
	}
	return null;
}

function fixture(h) {
	const f = new h.TFile('note.md', 'LOCAL');
	const settings = {
		customRepoName: 'fixture',
		authMode: 'manual_fine_grained',
		lastSyncState: { 'note.md': 'BASE' },
		localHashCache: {},
	};
	const app = {
		vault: {
			configDir: '.obsidian',
			getFiles: () => [f],
			getAbstractFileByPath: () => f,
			readBinary: async () => enc('LOCAL'),
			rename: async (file, target) => file,
			adapter: { read: async () => '', list: async () => ({ files: [] }) },
		},
	};
	const api = {
		getLatestCommitSha: async () => 'head',
		getTree: async () => ({
			sha: 'tree',
			tree: [{ type: 'blob', path: 'note.md', sha: 'REMOTE' }],
		}),
		downloadBlob: async () => enc('REMOTE'),
		getFileLastModified: async () => 1,
	};
	return { app, settings, api };
}

test('engine counts unresolved conflicts separately from successful choices', async () => {
	for (const resolved of [true, false]) {
		const h = harness(),
			f = fixture(h),
			E = h.load('sync-engine').SyncEngine,
			e = new E(f.app, f.settings, f.api);
		e.promptConflictResolution = async () => resolved;
		const r = await e.runSync(false);
		assert.equal(r.conflicts, 1);
		assert.equal(r.unresolvedConflicts, resolved ? 0 : 1);
	}
});

test('an automatic sync reports every conflict as unresolved', async () => {
	const h = harness(),
		f = fixture(h),
		E = h.load('sync-engine').SyncEngine,
		e = new E(f.app, f.settings, f.api);
	const r = await e.runSync(true);
	assert.equal(r.conflicts, 1);
	assert.equal(r.unresolvedConflicts, 1);
});

test('resolved manual conflicts are idle; unresolved conflicts are logged as incomplete', async () => {
	for (const unresolved of [0, 1]) {
		const h = harness(),
			p = h.plugin();
		p.syncEngine = {
			runSync: async () => ({ ...ok, conflicts: 1, unresolvedConflicts: unresolved }),
		};
		await p.triggerSync(false);
		assert.equal(p.statuses.at(-1)[0], unresolved ? 'error' : 'idle');
		assert.equal(p.settings.syncLog[0].unresolvedConflicts, unresolved);
	}
});

test('real dialog local choice succeeds while indexed rename failure stays unresolved', async () => {
	for (const choice of ['local', 'both']) {
		const h = harness(),
			f = fixture(h),
			E = h.load('sync-engine').SyncEngine,
			e = new E(f.app, f.settings, f.api);
		f.app.vault.rename = async () => {
			throw new Error('collision');
		};
		const up = [],
			down = [];
		const pending = e.promptConflictResolution({ filePath: 'note.md' }, up, down);
		h.modals[0].resolve(choice);
		assert.equal(await pending, choice === 'local');
		assert.equal(down.length, 0);
	}
});

test('a successful keep both rename queues the download and resolves the conflict', async () => {
	const h = harness(),
		f = fixture(h),
		E = h.load('sync-engine').SyncEngine,
		e = new E(f.app, f.settings, f.api);
	const up = [],
		down = [];
	const pending = e.promptConflictResolution({ filePath: 'note.md' }, up, down);
	h.modals[0].resolve('both');
	assert.equal(await pending, true);
	assert.deepEqual(down, ['note.md']);
});

test('unresolved log badge is not Success', () => {
	const h = harness(),
		M = h.load('sync-log-modal').SyncLogModal,
		m = new M({}, { syncLog: [{ ...ok, unresolvedConflicts: 1 }] }, async () => {});
	m.onOpen();
	const texts = [];
	function visit(e) {
		texts.push(e.text);
		e.children.forEach(visit);
	}
	visit(m.contentEl);
	assert.ok(texts.includes('Unresolved conflicts'));
	assert.ok(!texts.includes('Success'));
});

test('the copied log line reports unresolved conflicts and skipped files', async () => {
	const h = harness(),
		M = h.load('sync-log-modal').SyncLogModal,
		m = new M(
			{},
			{ syncLog: [{ ...ok, conflicts: 2, unresolvedConflicts: 1, skipped: 3 }] },
			async () => {},
		);
	m.onOpen();
	const button = findByText(m.contentEl, 'Copy logs');
	assert.ok(button, 'the copy button exists');
	for (const handler of button.listeners.click) handler();
	await Promise.resolve();
	assert.equal(h.copied.length, 1);
	assert.match(h.copied[0], /UNRESOLVED CONFLICTS: 1/);
	assert.match(h.copied[0], /skipped:3/);
});
