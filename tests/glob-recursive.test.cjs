const test = require('node:test'),
	assert = require('node:assert/strict');
const { load, setup } = require('./data-harness.cjs');
const { globToRegex } = load('utils');

// `**` used to be rewritten twice (`.*` -> `.[^/]*`), and `/**/` required at
// least one directory between the slashes.
const matches = (glob, path) => globToRegex(glob).test(path);

for (const [path, expected] of [
	['private/note.md', true],
	['private/a/note.md', true],
	['private/a/b/note.md', true],
	['private/a/b/note.txt', false],
	['other/note.md', false],
	['notprivate/note.md', false],
])
	test('private/**/*.md vs ' + path, () =>
		assert.equal(matches('private/**/*.md', path), expected),
	);

test('single star stays within one path segment', () => {
	assert.equal(matches('private/*.md', 'private/note.md'), true);
	assert.equal(matches('private/*.md', 'private/a/note.md'), false);
});

test('a trailing ** matches everything below', () => {
	assert.equal(matches('private/**', 'private/a/b/c.md'), true);
});

test('a leading **/ matches at any depth, including the root', () => {
	assert.equal(matches('**/draft.md', 'draft.md'), true);
	assert.equal(matches('**/draft.md', 'a/b/draft.md'), true);
	assert.equal(matches('**/draft.md', 'a/b/notdraft.md'), false);
});

test('regex characters and ? are handled literally / per segment', () => {
	assert.equal(matches('a+b.md', 'a+b.md'), true);
	assert.equal(matches('a+b.md', 'aab.md'), false);
	assert.equal(matches('n?te.md', 'note.md'), true);
	assert.equal(matches('n?te.md', 'n/te.md'), false);
});

test('a recursive ignore rule keeps private/note.md out of the upload', async () => {
	const x = await setup({
		local: { 'private/note.md': 'SECRET', 'public.md': 'OK' },
		ignore: 'private/**/*.md',
	});
	await x.engine.runSync(true);
	assert.equal(x.tree.has('private/note.md'), false);
	assert.equal(x.tree.has('public.md'), true);
});
