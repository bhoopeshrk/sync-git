const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup, buf, hash } = require('./data-harness.cjs');

// An unindexed file (root dotfiles such as .gitignore) whose local state
// cannot be read must never be treated as deleted: that would remove it from
// the remote and from every other device. The sync fails closed for that
// single file and continues with everything else.
const fixture = () =>
	setup({
		local: { '.gitignore': 'LOCAL' },
		remote: { '.gitignore': 'BASE' },
		base: { '.gitignore': 'BASE' },
		unindexed: ['.gitignore'],
	});

for (const operation of ['exists', 'stat', 'readBinary']) {
	test(operation + ' failure leaves the remote file untouched', async () => {
		const x = await fixture();
		x.engine.app.vault.adapter[operation] = async () => {
			throw Error('synthetic I/O failure');
		};
		const result = await x.engine.runSync(true);
		assert.equal(result.unreadable, 1);
		assert.equal(x.tree.size, 1);
		assert.equal(x.tree.get('.gitignore'), await hash(buf('BASE')));
		assert.equal(x.log.length, 0, 'nothing was committed');
	});
}

for (const [label, stat] of [
	['null', null],
	['folder', { type: 'folder' }],
]) {
	test('ambiguous ' + label + ' stat leaves the remote file untouched', async () => {
		const x = await fixture();
		x.engine.app.vault.adapter.stat = async () => stat;
		const result = await x.engine.runSync(true);
		assert.equal(result.unreadable, 1);
		assert.equal(x.tree.size, 1);
		assert.equal(x.tree.get('.gitignore'), await hash(buf('BASE')));
		assert.equal(x.log.length, 0, 'nothing was committed');
	});
}

test('an unreadable file keeps its previous sync state', async () => {
	const x = await fixture();
	x.engine.app.vault.adapter.readBinary = async () => {
		throw Error('synthetic read error');
	};
	await x.engine.runSync(true);
	assert.equal(
		x.settings.lastSyncState['.gitignore'],
		await hash(buf('BASE')),
		'the base state is preserved so the next sync retries the file',
	);
});

test('the rest of the sync still runs when one file cannot be read', async () => {
	const x = await setup({
		local: { '.gitignore': 'LOCAL', 'note.md': 'NOTE' },
		remote: { '.gitignore': 'BASE' },
		base: { '.gitignore': 'BASE' },
		unindexed: ['.gitignore'],
		readFails: ['.gitignore'],
	});
	const result = await x.engine.runSync(true);
	assert.equal(result.unreadable, 1);
	assert.equal(result.uploaded, 1);
	assert.equal(x.tree.get('note.md'), await hash(buf('NOTE')));
	assert.equal(x.tree.get('.gitignore'), await hash(buf('BASE')));
});

test('a file that could not be read is retried on the next sync', async () => {
	const x = await fixture();
	await x.engine.runSync(true);
	// The read now succeeds: the local change must be uploaded.
	x.engine.app.vault.adapter.readBinary = async (p) => x.disk.get(p).buffer;
	const result = await x.engine.runSync(true);
	assert.equal(result.unreadable, 0);
	assert.equal(x.tree.get('.gitignore'), await hash(buf('LOCAL')));
});

test('oversize unindexed file is skipped, not deleted remotely', async () => {
	const x = await fixture();
	x.disk.get('.gitignore').stat.size = 26 * 1024 * 1024;
	const result = await x.engine.runSync(true);
	assert.equal(result.skipped, 1);
	assert.equal(result.unreadable, 0);
	assert.equal(x.tree.size, 1);
	assert.equal(x.log.length, 0);
});

test('confirmed absence still propagates intended deletion', async () => {
	const x = await setup({ remote: { '.gitignore': 'BASE' }, base: { '.gitignore': 'BASE' } });
	await x.engine.runSync(true);
	assert.equal(x.tree.size, 0);
});
