const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup, buf, hash } = require('./data-harness.cjs');

// The comparison base used to be discarded when the target repository
// changed, so an A -> B -> A round trip lost A's history: a file deleted
// on A while on B looked brand new on return and was re-uploaded.

test('A -> B -> A restores the base so a file deleted on A stays deleted', async () => {
	const x = await setup({
		local: { 'del.md': 'KEEP' },
		remote: { 'del.md': 'KEEP' },
	});
	await x.engine.runSync(true);

	// repository B only holds a README
	x.settings.customRepoName = 'other-repo';
	x.tree.clear();
	x.tree.set('README.md', await hash(buf('README')));
	x.blobs.set(await hash(buf('README')), buf('README'));
	await x.engine.runSync(true);

	// `del.md` is deleted on A while we were on B
	x.settings.customRepoName = 'synthetic';
	x.tree.clear();
	await x.engine.runSync(true);

	assert.equal(
		x.disk.has('del.md'),
		false,
		'the file deleted on A stays deleted',
	);
	assert.equal(
		x.tree.has('del.md'),
		false,
		'the deletion is not undone by an upload',
	);
});

test('upgrade: 1.4.0 settings keep their state and survive a repository round trip', async () => {
	const x = await setup({
		local: { 'del.md': 'KEEP' },
		remote: { 'del.md': 'KEEP' },
		base: { 'del.md': 'KEEP' },
	});
	// Persisted by 1.4.0: state and repository marker, no per-repository map.
	x.settings.lastSyncRepo = '||synthetic';

	await x.engine.runSync(true);

	x.settings.customRepoName = 'other-repo';
	x.tree.clear();
	x.tree.set('README.md', await hash(buf('README')));
	x.blobs.set(await hash(buf('README')), buf('README'));
	await x.engine.runSync(true);

	x.settings.customRepoName = 'synthetic';
	x.tree.clear();
	await x.engine.runSync(true);

	assert.equal(
		x.disk.has('del.md'),
		false,
		'the state written by 1.4.0 is still used on return',
	);
});

test('upgrade: a 1.4.0 state is migrated into the per-repository map, not reset', async () => {
	const x = await setup({
		local: { 'n.md': 'BASE' },
		remote: {},
		base: { 'n.md': 'BASE' },
	});
	// Persisted by 1.4.0: state and repository marker, no per-repository map.
	x.settings.lastSyncRepo = '||synthetic';
	await x.engine.runSync(true);

	// The recorded deletion still fires, so the state was kept.
	assert.equal(x.disk.has('n.md'), false);
	assert.ok(
		x.settings.lastSyncStates?.['||synthetic'],
		'the state was migrated into the map',
	);
	assert.equal(x.settings.lastSyncRepo, '||synthetic');
});

test('a repository never seen before starts with an empty base', async () => {
	const x = await setup({
		local: { 'a.md': 'A' },
		remote: { 'a.md': 'A' },
	});
	await x.engine.runSync(true);
	x.settings.customRepoName = 'other-repo';
	x.tree.clear();
	await x.engine.runSync(true);

	assert.equal(x.text('a.md'), 'A', 'nothing is deleted locally');
	assert.equal(x.tree.has('a.md'), true, 'the local file is uploaded');
	assert.equal(
		x.settings.lastSyncStates?.['||other-repo'],
		x.settings.lastSyncState,
		'the new repository state is stored under its own key',
	);
});

test('the per-repository state map stays bounded', async () => {
	const x = await setup({
		local: { 'a.md': 'A' },
		remote: { 'a.md': 'A' },
	});
	await x.engine.runSync(true);
	for (let i = 0; i < 6; i++) {
		x.settings.customRepoName = 'repo-' + i;
		x.tree.clear();
		x.tree.set('README.md', await hash(buf('README')));
		x.blobs.set(await hash(buf('README')), buf('README'));
		await x.engine.runSync(true);
	}
	const states = x.settings.lastSyncStates ?? {};
	const keys = Object.keys(states);
	assert.ok(keys.length <= 5, `bounded to 5 entries, got ${keys.length}`);
	assert.ok(states['||repo-5'], 'the current repository is kept');
});
