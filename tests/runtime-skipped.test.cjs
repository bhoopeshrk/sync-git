const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, ok } = require('./runtime-harness.cjs');
test('skipped files produce persistent partial status and partial log badge', async () => {
	const h = harness(),
		p = h.plugin();
	p.syncEngine = { runSync: async () => ({ ...ok, skipped: 2 }) };
	await p.triggerSync();
	assert.equal(p.statuses.at(-1)[0], 'partial');
	assert.match(p.statuses.at(-1)[1], /2.*skipped/);
	const M = h.load('sync-log-modal').SyncLogModal,
		m = new M({}, p.settings, async () => {});
	m.onOpen();
	const texts = [];
	function visit(e) {
		texts.push(e.text);
		e.children.forEach(visit);
	}
	visit(m.contentEl);
	assert.ok(texts.includes('Partial'));
	assert.ok(!texts.includes('Success'));
	delete p.updateStatusBar;
	p.statusBarEl = new h.Element();
	p.updateStatusBar('partial', '2 files skipped');
	assert.match(p.statusBarEl.title, /2 files skipped/);
	assert.doesNotMatch(p.statusBarEl.title, /Up to date/);
});
