const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup } = require('./data-harness.cjs');

// "Keep both" renames the local copy before downloading the remote version.
// When the rename fails, the local file is the only surviving copy of the
// user's changes: overwriting it with the remote content would lose them.
for (const renameFails of [true, false])
	test('unindexed keep both rename failure=' + renameFails, async () => {
		const x = await setup({
			local: { '.gitignore': 'LOCAL' },
			remote: { '.gitignore': 'REMOTE' },
			base: { '.gitignore': 'BASE' },
			unindexed: ['.gitignore'],
			renameFails,
		});
		const before = x.settings.lastSyncState['.gitignore'];
		await x.engine.runSync(false);
		assert.equal(x.text('.gitignore'), renameFails ? 'LOCAL' : 'REMOTE');
		if (renameFails) {
			assert.equal(x.settings.lastSyncState['.gitignore'], before);
			assert.equal(
				x.log.some(([a]) => a === 'write' || a === 'create'),
				false,
			);
		} else
			assert.ok([...x.disk.keys()].some((p) => p !== '.gitignore' && x.text(p) === 'LOCAL'));
	});

test('a failed keep both rename is reported as an unresolved conflict', async () => {
	const x = await setup({
		local: { '.gitignore': 'LOCAL' },
		remote: { '.gitignore': 'REMOTE' },
		base: { '.gitignore': 'BASE' },
		unindexed: ['.gitignore'],
		renameFails: true,
	});
	const result = await x.engine.runSync(false);
	assert.equal(result.conflicts, 1);
	assert.equal(result.unresolvedConflicts, 1);
	assert.equal(x.text('.gitignore'), 'LOCAL', 'the local copy is intact');
});

test('a successful keep both rename resolves the conflict', async () => {
	const x = await setup({
		local: { '.gitignore': 'LOCAL' },
		remote: { '.gitignore': 'REMOTE' },
		base: { '.gitignore': 'BASE' },
		unindexed: ['.gitignore'],
	});
	const result = await x.engine.runSync(false);
	assert.equal(result.conflicts, 1);
	assert.equal(result.unresolvedConflicts, 0);
});
