const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup } = require('./data-harness.cjs');
for (const operation of ['exists', 'stat', 'readBinary'])
	test(operation + ' failure aborts before mutations', async () => {
		const x = await setup({
			local: { '.gitignore': 'LOCAL' },
			remote: { '.gitignore': 'BASE' },
			base: { '.gitignore': 'BASE' },
			unindexed: ['.gitignore'],
		});
		x.engine.app.vault.adapter[operation] = async () => {
			throw Error('synthetic I/O failure');
		};
		await assert.rejects(x.engine.runSync(true));
		assert.equal(x.tree.size, 1);
		assert.equal(x.log.length, 0);
	});
for (const type of ['null', 'folder'])
	test('ambiguous ' + type + ' stat aborts', async () => {
		const x = await setup({
			local: { '.gitignore': 'LOCAL' },
			remote: { '.gitignore': 'BASE' },
			base: { '.gitignore': 'BASE' },
			unindexed: ['.gitignore'],
		});
		x.engine.app.vault.adapter.stat = async () => (type === 'null' ? null : { type: 'folder' });
		await assert.rejects(x.engine.runSync(true));
		assert.equal(x.tree.size, 1);
	});
test('oversize unindexed file is skipped, not deleted remotely', async () => {
	const x = await setup({
		local: { '.gitignore': 'LOCAL' },
		remote: { '.gitignore': 'BASE' },
		base: { '.gitignore': 'BASE' },
		unindexed: ['.gitignore'],
	});
	x.disk.get('.gitignore').stat.size = 26 * 1024 * 1024;
	const result = await x.engine.runSync(true);
	assert.equal(result.skipped, 1);
	assert.equal(x.tree.size, 1);
	assert.equal(x.log.length, 0);
});
test('confirmed absence still propagates intended deletion', async () => {
	const x = await setup({ remote: { '.gitignore': 'BASE' }, base: { '.gitignore': 'BASE' } });
	await x.engine.runSync(true);
	assert.equal(x.tree.size, 0);
});
