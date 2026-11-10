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
			if (name === './utils') return { normalizeFilePath: (path) => path.normalize('NFC') };
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
]) {
	test('does not ignore ordinary path ' + path, () =>
		assert.equal(engine().isIgnored(path), false),
	);
}
test('explicit ignore rules remain effective', () => {
	const subject = engine();
	subject.ignoreRegexes = [/^private\//];
	assert.equal(subject.isIgnored('private/note.md'), true);
});
