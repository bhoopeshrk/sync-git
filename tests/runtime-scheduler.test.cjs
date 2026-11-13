const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./runtime-harness.cjs');

const result = {
	stateChanged: false,
	uploaded: 0,
	downloaded: 0,
	conflicts: 0,
	unresolvedConflicts: 0,
	unreadable: 0,
	skipped: 0,
	duration: 1,
};

test('no interval is started while auto sync is disabled', () => {
	const h = harness(),
		p = h.plugin();
	p.settings.autoSyncEnabled = false;
	p.settings.syncFrequencyMinutes = 15;
	p.setupScheduler();
	assert.equal(h.intervals.length, 0);
	assert.equal(p.syncIntervalId, null);
});

test('turning auto sync off at runtime clears the running interval', async () => {
	const h = harness(),
		p = h.plugin();
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
	assert.equal(p.syncIntervalId, null);
	// A stale interval that fires once more must not sync.
	await h.intervals[0].fn();
	assert.equal(calls, 0);
});

test('a disabled frequency prevents periodic syncs on its own', () => {
	const h = harness(),
		p = h.plugin();
	p.settings.autoSyncEnabled = true;
	p.settings.syncFrequencyMinutes = 0;
	p.setupScheduler();
	assert.equal(h.intervals.length, 0);
});

test('the periodic interval syncs while auto sync is enabled', async () => {
	const h = harness(),
		p = h.plugin();
	p.settings.autoSyncEnabled = true;
	p.setupScheduler();
	let calls = 0;
	p.triggerSync = async () => {
		calls++;
	};
	await h.intervals[0].fn();
	assert.equal(calls, 1);
});

test('manual sync still works while auto sync is disabled', async () => {
	const h = harness(),
		p = h.plugin();
	p.settings.autoSyncEnabled = false;
	let runs = 0;
	p.syncEngine = {
		runSync: async () => {
			runs++;
			return result;
		},
	};
	await p.triggerSync(false);
	assert.equal(runs, 1, 'the user initiated sync is not blocked');
	assert.equal(p.settings.lastSyncTime > 0, true);
});
