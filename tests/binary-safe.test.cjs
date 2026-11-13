const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, load, buf, hash } = require('./data-harness.cjs');
const utils = load('utils');
const bytes = (arr) => Uint8Array.from(arr).buffer;
const same = (a, b) => assert.deepEqual(new Uint8Array(a), new Uint8Array(b));

// Binary formats that are missing from the binary extension list, plus
// extension-less files, used to be treated as text: the bytes were decoded
// as UTF-8 (every invalid sequence becoming U+FFFD) and uploaded corrupted.
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

test('a known binary extension is never normalized', async () => {
	const content = bytes([0x41, 0x0d, 0x0a]);
	assert.equal(utils.isTextFile('photo.png'), false);
	const x = await setup({ local: { 'photo.png': content } });
	await x.engine.runSync(true);
	same(x.blobs.get(x.tree.get('photo.png')), content);
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

test('the hash cache is rebuilt once and then reused', async () => {
	const x = await setup({ local: { 'note.md': 'hello' } });
	await x.engine.runSync(true);
	assert.equal(x.settings.localHashCacheVersion, 1);
	let reads = 0;
	x.engine.app.vault.readBinary = async (f) => {
		reads++;
		return f.buffer;
	};
	await x.engine.runSync(true);
	assert.equal(reads, 0, 'unchanged files are not read again');
});

test('the one-time rebuild does not re-upload unchanged files', async () => {
	const x = await setup({
		local: { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' },
		remote: { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' },
		base: { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' },
	});
	// Pretend the cache was filled under the old rules.
	x.settings.localHashCacheVersion = 0;
	await x.engine.runSync(true);
	assert.equal(
		x.log.filter((entry) => entry[0] === 'commit').length,
		0,
		'nothing was uploaded',
	);
});

test('a file corrupted on the remote is repaired by the next sync', async () => {
	const content = bytes([0xff, 0xd8, 0x0d, 0x0a, 0x80, 0x41]);
	const x = await setup({
		local: { 'photo.heic': content },
		remote: { 'photo.heic': 'corrupted' },
		base: { 'photo.heic': 'corrupted' },
	});
	await x.engine.runSync(true);
	assert.equal(x.tree.get('photo.heic'), await hash(content));
	same(x.blobs.get(x.tree.get('photo.heic')), content);
});

test('unindexed binary files are uploaded unchanged', async () => {
	const content = bytes([0xff, 0x0d, 0x0a, 0x80]);
	const x = await setup({ local: { '.data.heic': content }, unindexed: ['.data.heic'] });
	await x.engine.runSync(true);
	assert.equal(x.tree.get('.data.heic'), await hash(content));
});

test('a binary file downloaded from the remote is written unchanged', async () => {
	const content = bytes([0xff, 0xd8, 0x0d, 0x0a, 0x80, 0x41]);
	const x = await setup({ remote: { 'photo.heic': content } });
	await x.engine.runSync(true);
	same(x.disk.get('photo.heic').buffer, content);
});
