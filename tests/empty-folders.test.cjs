const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./data-harness.cjs');

// Git has no folders: a folder renamed or deleted on another device reaches
// this device only as deleted files. The folders those deletions empty must
// go too, or a renamed folder shows up twice (old name empty, new name full).

test('a folder renamed on another device leaves no empty copy', async () => {
	const x = await setup({
		local: { 'Old Name/a.md': 'A', 'Old Name/sub/b.md': 'B' },
		base: { 'Old Name/a.md': 'A', 'Old Name/sub/b.md': 'B' },
		remote: { 'new-name/a.md': 'A', 'new-name/sub/b.md': 'B' },
	});
	await x.engine.runSync(true);
	assert.deepEqual([...x.disk.keys()].sort(), ['new-name/a.md', 'new-name/sub/b.md']);
	assert.equal(x.folders.has('Old Name/sub'), false);
	assert.equal(x.folders.has('Old Name'), false);
	assert.equal(x.folders.has('new-name/sub'), true);
});

test('only the emptied part of a folder chain is removed', async () => {
	const x = await setup({
		local: { 'A/B/C/x.md': 'X', 'A/keep.md': 'K' },
		base: { 'A/B/C/x.md': 'X', 'A/keep.md': 'K' },
		remote: { 'A/keep.md': 'K' },
	});
	await x.engine.runSync(true);
	assert.equal(x.folders.has('A/B/C'), false);
	assert.equal(x.folders.has('A/B'), false);
	assert.equal(x.folders.has('A'), true);
});

test('a folder that still holds a synced file is kept', async () => {
	const x = await setup({
		local: { 'Notes/a.md': 'A', 'Notes/keep.md': 'K' },
		base: { 'Notes/a.md': 'A', 'Notes/keep.md': 'K' },
		remote: { 'Notes/keep.md': 'K' },
	});
	await x.engine.runSync(true);
	assert.equal(x.folders.has('Notes'), true);
	assert.equal(x.disk.has('Notes/keep.md'), true);
});

test('a folder emptied and refilled in the same sync is kept', async () => {
	const x = await setup({
		local: { 'Notes/a.md': 'A' },
		base: { 'Notes/a.md': 'A' },
		remote: { 'Notes/b.md': 'B' },
	});
	await x.engine.runSync(true);
	assert.equal(x.folders.has('Notes'), true);
	assert.equal(x.disk.has('Notes/b.md'), true);
});

test('a hidden file the vault does not index keeps its folder', async () => {
	const x = await setup({
		local: { 'Old/a.md': 'A', 'Old/.DS_Store': 'meta' },
		base: { 'Old/a.md': 'A' },
		remote: {},
		unindexed: ['Old/.DS_Store'],
	});
	await x.engine.runSync(true);
	assert.equal(x.disk.has('Old/a.md'), false);
	assert.equal(x.disk.has('Old/.DS_Store'), true);
	assert.equal(x.folders.has('Old'), true);
});

test('an empty folder the sync did not touch is left alone', async () => {
	const x = await setup({
		local: { 'Gone/a.md': 'A' },
		base: { 'Gone/a.md': 'A' },
		remote: {},
		folders: ['Drafts'],
	});
	await x.engine.runSync(true);
	assert.equal(x.folders.has('Gone'), false);
	assert.equal(x.folders.has('Drafts'), true);
});

test('a file the sync could not delete keeps its folder', async () => {
	const x = await setup({
		local: { 'Notes/a.md': 'A' },
		base: { 'Notes/a.md': 'A' },
		remote: {},
		// Readable during the scan, unreadable at the re-check before deletion.
		recheckFails: ['Notes/a.md'],
	});
	await x.engine.runSync(true);
	assert.equal(x.disk.has('Notes/a.md'), true);
	assert.equal(x.folders.has('Notes'), true);
});
