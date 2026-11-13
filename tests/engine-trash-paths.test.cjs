const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function engine() {
	const module = { exports: {} };
	const source = fs.readFileSync(
		require('node:path').join(__dirname, '../src/sync-engine.ts'),
		'utf8',
	);
	const code = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
	}).outputText;
	vm.runInNewContext(code, {
		module,
		exports: module.exports,
		require(name) {
			if (name === './utils')
				return { normalizeFilePath: (path) => path.replace(/\\/g, '/').normalize('NFC') };
			if (name === './types') return { LOCAL_HASH_CACHE_VERSION: 1 };
			if (['obsidian', './github-api', './conflict-modal'].includes(name)) return {};
			throw new Error('Unexpected import: ' + name);
		},
	});
	return new module.exports.SyncEngine({ vault: { configDir: '.obsidian' } }, {}, {});
}
for (const path of [
	'.trash/note.md',
	'folder/.trash/note.md',
	'.trash',
	'.obsidian/plugins/plugin/main.js',
]) {
	test('still ignores protected path ' + path, () =>
		assert.equal(engine().isIgnored(path), true),
	);
}
for (const path of [
	'notes.trash.md',
	'notes/.trashcan.md',
	'folder.trash/note.md',
	'.trash-backup/note.md',
	'note.md',
	'notes/trash.md',
	'notes/.trash.md',
	'trash/note.md',
	'.trashed/note.md',
]) {
	test('does not ignore ordinary path ' + path, () =>
		assert.equal(engine().isIgnored(path), false),
	);
}
// A folder (or file) named exactly `.trash` is excluded wherever it appears:
// Obsidian's own trash lives at the vault root, and a nested `.trash` folder
// is treated the same way so deleted content is never re-uploaded.
for (const path of [
	'a/.trash/b/c.md',
	'.trash/nested/deep.md',
	'.trash/',
]) {
	test('ignores .trash segment at any depth: ' + path, () =>
		assert.equal(engine().isIgnored(path), true),
	);
}
test('windows separators are normalized before matching', () => {
	assert.equal(engine().isIgnored('notes\\ideas.trash.md'), false);
	assert.equal(engine().isIgnored('.trash\\note.md'), true);
});
test('explicit ignore rules remain effective', () => {
	const subject = engine();
	subject.ignoreRegexes = [/^private\//];
	assert.equal(subject.isIgnored('private/note.md'), true);
});
