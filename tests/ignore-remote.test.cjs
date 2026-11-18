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

// Un-ignoring: the ignore rule is active for one sync, then removed. Each test
// syncs once while the rule is active (an auto sync runs during the ignored
// period) and again after `setIgnore('')`.

test('un-ignoring a file whose two sides agree re-records the base silently', async () => {
	const x = await setup({
		local: { 'private.md': 'SECRET' },
		remote: { 'private.md': 'SECRET' },
		base: { 'private.md': 'SECRET' },
		ignore: 'private.md',
	});
	await x.engine.runSync(true); // sync while the rule is active
	x.setIgnore(''); // the rule is removed
	const logBefore = x.log.length;
	const result = await x.engine.runSync(true);
	assert.equal(result.conflicts, 0, 'no conflict is reported');
	assert.equal(result.unresolvedConflicts, 0);
	assert.equal(result.downloaded, 0, 'the file is not re-downloaded');
	assert.equal(result.uploaded, 0, 'the file is not re-uploaded');
	assert.equal(x.text('private.md'), 'SECRET', 'the local copy is untouched');
	assert.equal(
		x.tree.get('private.md'),
		await hash(buf('SECRET')),
		'the remote copy is untouched',
	);
	assert.equal(
		x.log
			.slice(logBefore)
			.some(([op]) => op === 'write' || op === 'create' || op === 'trash' || op === 'commit'),
		false,
		'nothing is written, deleted or committed',
	);
	assert.equal(
		x.settings.lastSyncState['private.md'],
		await hash(buf('SECRET')),
		'the base is re-recorded',
	);
});

test('un-ignoring a file that diverged on both sides conflicts on auto sync', async () => {
	const x = await setup({
		local: { 'private.md': 'LOCAL-EDIT' },
		remote: { 'private.md': 'REMOTE-EDIT' },
		base: { 'private.md': 'OLD' },
		ignore: 'private.md',
	});
	await x.engine.runSync(true); // sync while the rule is active
	assert.equal(
		x.text('private.md'),
		'LOCAL-EDIT',
		'the ignored file is untouched while the rule is active',
	);
	x.setIgnore(''); // the rule is removed
	const logBefore = x.log.length;
	const result = await x.engine.runSync(true);
	assert.equal(result.conflicts, 1, 'the divergence is reported as a conflict');
	assert.equal(result.unresolvedConflicts, 1, 'an auto sync cannot resolve it');
	assert.equal(result.downloaded, 0, 'the remote version is not written');
	assert.equal(result.uploaded, 0, 'the local version is not pushed');
	assert.equal(x.text('private.md'), 'LOCAL-EDIT', 'the local copy is untouched');
	assert.equal(
		x.tree.get('private.md'),
		await hash(buf('REMOTE-EDIT')),
		'the remote copy is untouched',
	);
	assert.equal(
		x.log
			.slice(logBefore)
			.some(([op]) => op === 'write' || op === 'create' || op === 'trash' || op === 'commit'),
		false,
		'nothing is written, deleted or committed',
	);
});

test('un-ignoring a file that diverged on both sides offers the conflict dialog on manual sync', async () => {
	const x = await setup({
		local: { 'private.md': 'LOCAL-EDIT' },
		remote: { 'private.md': 'REMOTE-EDIT' },
		base: { 'private.md': 'OLD' },
		ignore: 'private.md',
	});
	await x.engine.runSync(true); // sync while the rule is active
	x.setIgnore(''); // the rule is removed
	const result = await x.engine.runSync(false); // manual sync opens the dialog
	assert.equal(result.conflicts, 1, 'the divergence goes through the dialog flow');
	assert.equal(result.unresolvedConflicts, 0, 'the dialog choice resolves it');
	// The harness answers the dialog with "keep both": the local copy is
	// renamed and the remote copy is downloaded, so both survive.
	assert.equal(x.text('private.md'), 'REMOTE-EDIT', 'the remote version is downloaded');
	assert.equal(
		[...x.disk.keys()].some((p) => p !== 'private.md' && x.text(p) === 'LOCAL-EDIT'),
		true,
		'the local copy was kept under the conflict name',
	);
});

test('un-ignoring a file the remote deleted re-uploads it instead of deleting the local copy', async () => {
	const x = await setup({
		local: { 'private.md': 'KEEP' },
		remote: {}, // the remote copy was deleted while the rule was active
		base: { 'private.md': 'KEEP' },
		ignore: 'private.md',
	});
	await x.engine.runSync(true); // sync while the rule is active
	x.setIgnore(''); // the rule is removed
	const result = await x.engine.runSync(true);
	assert.equal(result.uploaded, 1, 'the local copy is pushed back');
	assert.equal(result.conflicts, 0, 'no conflict for a remote deletion without a stale base');
	assert.equal(x.disk.has('private.md'), true, 'the local file still exists');
	assert.equal(x.text('private.md'), 'KEEP', 'the local copy is untouched');
	assert.equal(
		x.tree.get('private.md'),
		await hash(buf('KEEP')),
		'the remote copy is restored',
	);
	assert.equal(
		x.settings.lastSyncState['private.md'],
		await hash(buf('KEEP')),
		'the base is recorded',
	);
});
