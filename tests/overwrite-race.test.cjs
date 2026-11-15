const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup, buf, hash, setChoice } = require('./data-harness.cjs');

// The engine decides from a snapshot taken at the start of the sync. Editing a
// note while the download runs used to be overwritten without any conflict.
const edit = (x, path, text) => {
	const f = x.disk.get(path);
	f.buffer = buf(text);
	f.stat = { size: f.buffer.byteLength, mtime: 99 };
};

test('a note edited during the download is not overwritten', async () => {
	const x = await setup({
		local: { 'n.md': 'BASE' },
		remote: { 'n.md': 'NEW' },
		base: { 'n.md': 'BASE' },
	});
	const download = x.api.downloadBlob;
	x.api.downloadBlob = async (...a) => {
		const b = await download(...a);
		edit(x, 'n.md', 'EDITED WHILE DOWNLOADING');
		return b;
	};
	const result = await x.engine.runSync(true);
	assert.equal(x.text('n.md'), 'EDITED WHILE DOWNLOADING');
	assert.equal(x.log.some((e) => e[0] === 'modify' || e[0] === 'write'), false);
	assert.equal(result.downloaded, 0);
	assert.equal(result.conflicts, 1);
	assert.equal(result.unresolvedConflicts, 1);
	assert.equal(x.settings.lastSyncState['n.md'], await hash(buf('BASE')), 'base is unchanged');

	// the next sync sees a regular conflict and still does not overwrite
	x.api.downloadBlob = download;
	const next = await x.engine.runSync(true);
	assert.equal(x.text('n.md'), 'EDITED WHILE DOWNLOADING');
	assert.equal(next.unresolvedConflicts, 1);
});

test('after the race, a manual sync resolves it through the conflict dialog', async () => {
	setChoice('both');
	const x = await setup({
		local: { 'n.md': 'BASE' },
		remote: { 'n.md': 'NEW' },
		base: { 'n.md': 'BASE' },
	});
	const download = x.api.downloadBlob;
	x.api.downloadBlob = async (...a) => {
		const b = await download(...a);
		edit(x, 'n.md', 'EDITED');
		return b;
	};
	await x.engine.runSync(true);
	x.api.downloadBlob = download;
	await x.engine.runSync(false);
	assert.equal(x.text('n.md'), 'NEW');
	assert.equal(x.text('n (Local Conflict 2026-11-10).md'), 'EDITED', 'the edit survives as a copy');
});

test('an unchanged file is still downloaded', async () => {
	const x = await setup({
		local: { 'n.md': 'BASE' },
		remote: { 'n.md': 'NEW' },
		base: { 'n.md': 'BASE' },
	});
	const result = await x.engine.runSync(true);
	assert.equal(x.text('n.md'), 'NEW');
	assert.equal(result.downloaded, 1);
	assert.equal(x.settings.lastSyncState['n.md'], await hash(buf('NEW')));
});

test('a file created locally during the download is not overwritten', async () => {
	const x = await setup({ remote: { 'new.md': 'REMOTE' } });
	const download = x.api.downloadBlob;
	x.api.downloadBlob = async (...a) => {
		const b = await download(...a);
		x.disk.set('new.md', { path: 'new.md', buffer: buf('LOCAL'), stat: { size: 5, mtime: 5 } });
		return b;
	};
	await x.engine.runSync(true);
	assert.equal(x.text('new.md'), 'LOCAL');
});

test('a file edited before a local deletion is kept and uploaded later', async () => {
	setChoice('local');
	const x = await setup({
		local: { 'gone.md': 'BASE', 'c.md': 'LOCAL' },
		remote: { 'c.md': 'REMOTE' },
		base: { 'gone.md': 'BASE', 'c.md': 'OLD' },
	});
	// gone.md was deleted remotely; while the conflict on c.md is prepared,
	// the user edits it
	x.api.getFileLastModified = async () => {
		edit(x, 'gone.md', 'EDITED');
		return 0;
	};
	await x.engine.runSync(false);
	assert.equal(x.text('gone.md'), 'EDITED');
	assert.equal(x.log.some((e) => e[0] === 'trash' && e[1] === 'gone.md'), false);
	setChoice('both');
});

test('deleting an unchanged file locally still works', async () => {
	const x = await setup({
		local: { 'gone.md': 'BASE' },
		base: { 'gone.md': 'BASE' },
	});
	await x.engine.runSync(true);
	assert.equal(x.disk.has('gone.md'), false);
});
