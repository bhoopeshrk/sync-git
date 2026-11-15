const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup, buf, hash } = require('./data-harness.cjs');

// The ignore rules used to be applied to the local file list only, so an
// ignored file looked like a file that was deleted locally.
test('a file added to the ignore list is not deleted from the remote', async () => {
	const x = await setup({
		local: { 'private.md': 'SECRET' },
		remote: { 'private.md': 'SECRET' },
		base: { 'private.md': 'SECRET' },
		ignore: 'private.md',
	});
	await x.engine.runSync(true);
	assert.equal(x.tree.has('private.md'), true, 'remote copy is untouched');
	assert.equal(x.text('private.md'), 'SECRET', 'local copy is untouched');
	assert.equal(x.log.some((e) => e[0] === 'commit'), false, 'nothing is committed');
	assert.equal(x.settings.lastSyncState['private.md'], undefined, 'stale base is dropped');
});

test('an ignored remote-only file is not downloaded', async () => {
	const x = await setup({
		remote: { 'private/a.md': 'A', 'public.md': 'P' },
		ignore: 'private/',
	});
	await x.engine.runSync(true);
	assert.equal(x.disk.has('private/a.md'), false);
	assert.equal(x.text('public.md'), 'P');
});

test('an ignored remote change does not overwrite a differing local file', async () => {
	const x = await setup({
		local: { 'private.md': 'LOCAL' },
		remote: { 'private.md': 'REMOTE' },
		base: { 'private.md': 'LOCAL' },
		ignore: 'private.md',
	});
	await x.engine.runSync(true);
	assert.equal(x.text('private.md'), 'LOCAL');
	assert.equal(x.tree.get('private.md'), await hash(buf('REMOTE')));
});

test('files under the config dir in the remote are never downloaded', async () => {
	const x = await setup({
		local: { '.obsidian/plugins/p/data.json': 'LOCAL' },
		remote: { '.obsidian/plugins/p/data.json': 'REMOTE', 'n.md': 'N' },
	});
	await x.engine.runSync(true);
	assert.equal(x.text('.obsidian/plugins/p/data.json'), 'LOCAL');
	assert.equal(x.text('n.md'), 'N');
});

test('non-ignored files keep syncing normally', async () => {
	const x = await setup({
		local: { 'a.md': 'A2', 'private.md': 'S' },
		remote: { 'a.md': 'A1', 'private.md': 'S' },
		base: { 'a.md': 'A1', 'private.md': 'S' },
		ignore: 'private.md',
	});
	await x.engine.runSync(true);
	assert.equal(x.tree.get('a.md'), await hash(buf('A2')));
});
