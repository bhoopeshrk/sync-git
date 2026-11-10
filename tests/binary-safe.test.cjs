const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, load, buf, hash } = require('./data-harness.cjs');
const utils = load('utils');
const bytes = (arr) => Uint8Array.from(arr).buffer;
const same = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));

// Extensions missing from the binary list (and extensionless files) are treated as text.
for (const name of [
	'photo.heic',
	'image.avif',
	'clip.mov',
	'clip.webm',
	'book.epub',
	'data.custom',
	'opaque',
]) {
	test('uploads binary content unchanged: ' + name, async () => {
		const content = bytes([0xff, 0xd8, 0x0d, 0x0a, 0x80, 0x41]);
		const x = await setup({ local: { [name]: content } });
		await x.engine.runSync(true);
		same(x.blobs.get(x.tree.get(name)), content);
	});
}

for (const [label, input] of [
	['invalid UTF-8', [0x41, 0xff, 0x0d, 0x0a]],
	['UTF-16LE with BOM', [0xff, 0xfe, 0x41, 0x00, 0x0d, 0x00, 0x0a, 0x00]],
	['UTF-16BE with BOM', [0xfe, 0xff, 0x00, 0x41, 0x00, 0x0d, 0x00, 0x0a]],
	['NUL bytes', [0x41, 0x00, 0x0d, 0x0a]],
]) {
	test('normalizeTextBuffer preserves ' + label, () => {
		same(utils.normalizeTextBuffer(bytes(input)), bytes(input));
	});
}

test('normalizeTextBuffer keeps a UTF-8 BOM and still converts CRLF', () => {
	same(
		utils.normalizeTextBuffer(bytes([0xef, 0xbb, 0xbf, 0x41, 0x0d, 0x0a])),
		bytes([0xef, 0xbb, 0xbf, 0x41, 0x0a]),
	);
});

test('normalizeTextBuffer still converts CRLF in UTF-8 text', () => {
	assert.equal(new TextDecoder().decode(utils.normalizeTextBuffer(buf('a\r\nb\r\n'))), 'a\nb\n');
});

test('hashes cached under the old rules are recomputed once', async () => {
	const content = bytes([0xff, 0x0d, 0x0a]);
	const x = await setup({
		local: { 'x.heic': content },
		remote: { 'x.heic': 'old' },
		base: { 'x.heic': 'old' },
	});
	// A pre-upgrade cache entry whose metadata still matches the file.
	x.settings.localHashCache['x.heic'] = { mtime: 1, size: 3, sha: await hash(buf('old')) };
	await x.engine.runSync(true);
	assert.equal(x.settings.localHashCacheVersion, 1);
	assert.equal(x.tree.get('x.heic'), await hash(content));
	same(x.disk.get('x.heic').buffer, content);
});

test('unindexed binary files are uploaded unchanged', async () => {
	const content = bytes([0xff, 0x0d, 0x0a, 0x80]);
	const x = await setup({ local: { '.data.heic': content }, unindexed: ['.data.heic'] });
	await x.engine.runSync(true);
	assert.equal(x.tree.get('.data.heic'), await hash(content));
});

test('cache entries written under the new rules are reused', async () => {
	const x = await setup({ local: { 'x.heic': bytes([0xff]) } });
	await x.engine.runSync(true);
	const cached = x.settings.localHashCache['x.heic'];
	await x.engine.runSync(true);
	assert.equal(x.settings.localHashCache['x.heic'], cached);
});
