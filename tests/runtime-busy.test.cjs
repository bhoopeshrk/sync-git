const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, ok } = require('./runtime-harness.cjs');
test('manual and force requests explain busy state without launching concurrent work', async () => {
	const h = harness(),
		p = h.plugin();
	let release,
		runs = 0;
	p.syncEngine = {
		runSync() {
			runs++;
			return new Promise((r) => (release = r));
		},
	};
	const active = p.triggerSync();
	const before = h.notices.length;
	await p.triggerSync(false, true);
	assert.equal(h.notices.length, before + 1);
	assert.match(h.notices.at(-1), /already in progress/i);
	await p.triggerSync(true);
	assert.equal(h.notices.length, before + 1);
	assert.equal(runs, 1);
	release(ok);
	await active;
});
