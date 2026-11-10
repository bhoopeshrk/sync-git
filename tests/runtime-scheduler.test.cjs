const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./runtime-harness.cjs');
test('disabled automatic scheduling clears timer and stale callbacks do not sync', async () => {
	const h = harness(),
		p = h.plugin();
	p.settings.autoSyncEnabled = false;
	p.setupScheduler();
	assert.equal(h.intervals.length, 0);
	p.settings.autoSyncEnabled = true;
	p.setupScheduler();
	assert.equal(h.intervals.length, 1);
	let calls = 0;
	p.triggerSync = async () => {
		calls++;
	};
	p.settings.autoSyncEnabled = false;
	p.setupScheduler();
	assert.deepEqual(h.cleared, [1]);
	await h.intervals[0].fn();
	assert.equal(calls, 0);
	assert.equal(p.syncIntervalId, null);
});
