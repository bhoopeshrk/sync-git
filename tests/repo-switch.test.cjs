const test = require('node:test'),
	assert = require('node:assert/strict');
const { setup, buf, hash } = require('./data-harness.cjs');

// `lastSyncState` used to survive a change of the target repository, so files
// missing in the new repository looked like remote deletions.
test('switching the repository does not delete local notes', async () => {
	const x = await setup({
		local: { 'important.md': 'IMPORTANT' },
		remote: { 'important.md': 'IMPORTANT' },
	});
	await x.engine.runSync(true);
	assert.equal(x.settings.lastSyncState['important.md'], await hash(buf('IMPORTANT')));

	// repository B only holds a README
	x.tree.clear();
	x.settings.customRepoName = 'other-repo';
	x.tree.set('README.md', await hash(buf('README')));
	x.blobs.set(await hash(buf('README')), buf('README'));

	await x.engine.runSync(true);
	assert.equal(x.log.some((e) => e[0] === 'trash' || e[0] === 'remove'), false);
	assert.equal(x.text('important.md'), 'IMPORTANT');
	assert.equal(x.text('README.md'), 'README');
	assert.equal(x.tree.get('important.md'), await hash(buf('IMPORTANT')), 'uploaded to B');
});

test('switching to a repository with a different version of a file reports a conflict instead of overwriting', async () => {
	const x = await setup({
		local: { 'n.md': 'LOCAL' },
		remote: { 'n.md': 'LOCAL' },
	});
	await x.engine.runSync(true);
	x.tree.clear();
	x.settings.customRepoName = 'other-repo';
	x.tree.set('n.md', await hash(buf('OTHER')));
	x.blobs.set(await hash(buf('OTHER')), buf('OTHER'));
	const result = await x.engine.runSync(true);
	assert.equal(x.text('n.md'), 'LOCAL');
	assert.equal(result.conflicts, 1);
});

test('changing the GitHub user or API URL also starts a fresh comparison', async () => {
	for (const change of [
		(s) => (s.githubUsername = 'someone-else'),
		(s) => (s.githubApiUrl = 'https://ghe.example/api/v3'),
	]) {
		const x = await setup({
			local: { 'a.md': 'A' },
			remote: { 'a.md': 'A' },
		});
		x.settings.githubUsername = 'me';
		await x.engine.runSync(true);
		x.tree.clear();
		change(x.settings);
		await x.engine.runSync(true);
		assert.equal(x.text('a.md'), 'A');
		assert.equal(x.tree.has('a.md'), true);
	}
});

test('upgrade: a missing repository marker is adopted without resetting the state', async () => {
	const x = await setup({
		local: { 'n.md': 'BASE' },
		remote: {},
		base: { 'n.md': 'BASE' },
	});
	// n.md was deleted remotely on another device: local deletion is expected
	await x.engine.runSync(true);
	assert.equal(x.disk.has('n.md'), false);
	assert.ok(x.settings.lastSyncRepo, 'the marker is stored');
});

test('staying on the same repository keeps deletions working', async () => {
	const x = await setup({
		local: { 'n.md': 'BASE' },
		remote: { 'n.md': 'BASE' },
	});
	await x.engine.runSync(true);
	x.tree.delete('n.md');
	await x.engine.runSync(true);
	assert.equal(x.disk.has('n.md'), false);
});
