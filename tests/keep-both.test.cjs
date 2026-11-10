const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup } = require('./data-harness.cjs');
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
