const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup, buf, hash } = require('./data-harness.cjs');
for (const failure of ['500', '422'])
	test('failed commit ' + failure + ' preserves upload and deletion bases', async () => {
		const x = await setup({
			local: { 'n.md': 'LOCAL' },
			remote: { 'n.md': 'BASE', 'gone.md': 'GONE' },
			base: { 'n.md': 'BASE', 'gone.md': 'GONE' },
		});
		const commit = x.api.commit;
		let attempts = 0;
		x.api.commit = async () => {
			attempts++;
			throw Error('synthetic ' + failure);
		};
		await assert.rejects(x.engine.runSync(true));
		assert.equal(attempts, failure === '422' ? 3 : 1);
		assert.equal(x.settings.lastSyncState['n.md'], await hash(buf('BASE')));
		assert.equal(x.settings.lastSyncState['gone.md'], await hash(buf('GONE')));
		assert.equal(x.text('n.md'), 'LOCAL');
		x.api.commit = commit;
		await x.engine.runSync(true);
		assert.equal(x.tree.get('n.md'), await hash(buf('LOCAL')));
		assert.equal(x.settings.lastSyncState['n.md'], x.tree.get('n.md'));
		assert.equal(x.tree.has('gone.md'), false);
		assert.equal(x.settings.lastSyncState['gone.md'], undefined);
	});
test('second blob failure does not acknowledge first uploaded blob', async () => {
	const x = await setup({ local: { 'a.md': 'A', 'b.md': 'B' } });
	const upload = x.api.uploadBlob;
	let calls = 0;
	x.api.uploadBlob = async (...args) => {
		if (++calls === 2) throw Error('upload failed');
		return upload(...args);
	};
	await assert.rejects(x.engine.runSync(true));
	assert.deepEqual(x.settings.lastSyncState, {});
	assert.equal(x.tree.size, 0);
});
