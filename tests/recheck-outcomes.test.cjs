const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup, buf, hash, setChoice } = require('./data-harness.cjs');

// PR #30 re-checks a local file immediately before overwriting or deleting
// it. Both outcomes of that re-check must be surfaced: a file that changed
// since the scan (the delete is skipped *and reported*), and a file whose
// re-check read fails (the file is left untouched and reported as unreadable
// instead of aborting the whole sync).
const edit = (x, path, text) => {
	const f = x.disk.get(path);
	f.buffer = buf(text);
	f.stat = { size: f.buffer.byteLength, mtime: 99 };
};
const deleted = (x, path) =>
	x.log.some(
		(e) => (e[0] === 'trash' || e[0] === 'remove') && e[1] === path,
	);

test('a delete skipped because the file changed during the sync is reported', async () => {
	setChoice('local');
	const x = await setup({
		local: { 'gone.md': 'BASE', 'c.md': 'LOCAL' },
		remote: { 'c.md': 'REMOTE' },
		base: { 'gone.md': 'BASE', 'c.md': 'OLD' },
	});
	// While the conflict on c.md is prepared, the user edits gone.md.
	x.api.getFileLastModified = async () => {
		edit(x, 'gone.md', 'EDITED');
		return 0;
	};
	const result = await x.engine.runSync(false);
	assert.equal(x.text('gone.md'), 'EDITED', 'the edited file survives');
	assert.equal(deleted(x, 'gone.md'), false, 'nothing was deleted');
	assert.equal(result.skipped, 1, 'the raced delete reaches the result');
	setChoice('both');
});

test('an unreadable file during the download re-check does not abort the sync', async () => {
	const x = await setup({
		local: { 'n.md': 'BASE', 'm.md': 'MBASE' },
		remote: { 'n.md': 'NEW', 'm.md': 'MNEW' },
		base: { 'n.md': 'BASE', 'm.md': 'MBASE' },
		recheckFails: ['n.md'],
	});
	const result = await x.engine.runSync(true);
	assert.equal(result.unreadable, 1, 'the failed re-check is reported');
	assert.equal(x.text('n.md'), 'BASE', 'the unreadable file is unchanged');
	assert.equal(
		x.settings.lastSyncState['n.md'],
		await hash(buf('BASE')),
		'its sync state is kept for the next retry',
	);
	assert.equal(result.downloaded, 1, 'the other file still syncs');
	assert.equal(x.text('m.md'), 'MNEW');
});

test('an unreadable file during the delete re-check does not abort the sync', async () => {
	const x = await setup({
		local: { 'gone.md': 'BASE', 'keep.md': 'KB' },
		remote: { 'keep.md': 'KNEW' },
		base: { 'gone.md': 'BASE', 'keep.md': 'KB' },
		recheckFails: ['gone.md'],
	});
	const result = await x.engine.runSync(true);
	assert.equal(result.unreadable, 1, 'the failed re-check is reported');
	assert.equal(x.disk.has('gone.md'), true, 'the file is left on disk');
	assert.equal(x.text('gone.md'), 'BASE', 'it is byte-for-byte unchanged');
	assert.equal(deleted(x, 'gone.md'), false, 'it was not deleted');
	assert.equal(result.downloaded, 1, 'the rest of the sync continues');
	assert.equal(x.text('keep.md'), 'KNEW');
});
