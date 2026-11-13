const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup, buf, hash } = require('./data-harness.cjs');

// `lastSyncState` must only be updated once the remote really holds the new
// content. Recording it while the commit is still in flight makes the next
// sync believe the local edits were pushed, and overwrite them with the
// older remote version - or resurrect a file the user deleted locally.
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

test('a failed commit does not delete the file from the remote', async () => {
	const x = await setup({
		remote: { 'gone.md': 'GONE' },
		base: { 'gone.md': 'GONE' },
	});
	x.api.commit = async () => {
		throw Error('synthetic commit failure');
	};
	await assert.rejects(x.engine.runSync(true));
	assert.equal(x.tree.has('gone.md'), true, 'the remote still holds the file');
	assert.equal(
		x.settings.lastSyncState['gone.md'],
		await hash(buf('GONE')),
		'the base state is preserved so the deletion is retried',
	);
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

test('a successful commit records the new state', async () => {
	const x = await setup({ local: { 'n.md': 'LOCAL' } });
	await x.engine.runSync(true);
	assert.equal(x.settings.lastSyncState['n.md'], await hash(buf('LOCAL')));
	assert.equal(x.tree.get('n.md'), await hash(buf('LOCAL')));
});

test('the remote-only fast path still records the remote hash', async () => {
	const x = await setup({
		local: { 'n.md': 'SAME' },
		remote: { 'n.md': 'SAME' },
		base: { 'n.md': 'OLD' },
	});
	await x.engine.runSync(true);
	assert.equal(x.settings.lastSyncState['n.md'], await hash(buf('SAME')));
});

test('a state update lost after a successful commit needs no duplicate commit', async () => {
	const x = await setup({ local: { 'n.md': 'LOCAL' } });
	await x.engine.runSync(true);
	// Simulate a crash between the commit and the persisted settings write:
	// the remote holds the new content, the local state does not know yet.
	x.settings.lastSyncState = {};
	await x.engine.runSync(true);
	assert.equal(x.settings.lastSyncState['n.md'], await hash(buf('LOCAL')));
	assert.equal(
		x.log.filter((entry) => entry[0] === 'commit').length,
		1,
		'the identical content is not committed twice',
	);
});
