const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(requestUrl) {
	const module = { exports: {} };
	const source = fs.readFileSync(
		require('node:path').join(__dirname, '../src/github-api.ts'),
		'utf8',
	);
	const code = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
	}).outputText;
	vm.runInNewContext(code, {
		module,
		exports: module.exports,
		Error,
		require(name) {
			assert.equal(name, 'obsidian');
			return { requestUrl };
		},
	});
	return new module.exports.GitHubApiClient('synthetic', 'owner', 'https://example.invalid');
}

test('file timestamps come from main even when the default branch differs', async () => {
	const calls = [];
	const mainDate = '2026-01-01T00:00:00Z';
	const api = load(async (options) => {
		calls.push(options);
		const url = new URL(options.url);
		return {
			status: 200,
			json: [
				{
					commit: {
						committer: {
							date:
								url.searchParams.get('sha') === 'main'
									? mainDate
									: '2025-01-01T00:00:00Z',
						},
					},
				},
			],
		};
	});
	assert.equal(await api.getFileLastModified('vault', 'folder/a #?.md'), Date.parse(mainDate));
	const url = new URL(calls[0].url);
	assert.equal(url.searchParams.get('path'), 'folder/a #?.md');
	assert.equal(url.searchParams.get('per_page'), '1');
	assert.equal(url.searchParams.get('sha'), 'main');
});
test('empty history and transport failure keep unknown timestamp fallback', async () => {
	assert.equal(
		await load(async () => ({ status: 200, json: [] })).getFileLastModified('vault', 'a.md'),
		0,
	);
	assert.equal(
		await load(async () => {
			throw new Error('Offline');
		}).getFileLastModified('vault', 'a.md'),
		0,
	);
});
