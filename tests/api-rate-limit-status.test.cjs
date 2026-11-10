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

// Return HTTP responses directly to isolate classification from Obsidian's throw option.
test('403 with remaining quota is permission denial despite reset header', async () => {
	const api = load(async () => ({
		status: 403,
		headers: { 'x-ratelimit-reset': '2000000000', 'x-ratelimit-remaining': '42' },
		text: '',
		json: {},
	}));
	await assert.rejects(
		api.getTree('vault', 'tree'),
		(error) => error.status === 403 && /Permission denied/.test(error.message),
	);
});
test('exhausted quota with reset header retains rate limit guidance', async () => {
	const api = load(async () => ({
		status: 403,
		headers: { 'x-ratelimit-reset': '2000000000', 'x-ratelimit-remaining': '0' },
		text: '',
		json: {},
	}));
	await assert.rejects(api.getTree('vault', 'tree'), /rate limited/);
});
test('missing quota evidence does not misclassify permission errors', async () => {
	const api = load(async () => ({
		status: 403,
		headers: { 'x-ratelimit-reset': '2000000000' },
		text: '',
		json: {},
	}));
	await assert.rejects(
		api.getTree('vault', 'tree'),
		(error) => error.status === 403 && /Permission denied/.test(error.message),
	);
});
test('secondary rate limit (403 with retry-after and quota left) is reported as rate limited', async () => {
	const api = load(async () => ({
		status: 403,
		headers: {
			'retry-after': '120',
			'x-ratelimit-remaining': '4000',
			'x-ratelimit-reset': '2000000000',
		},
		text: '{"message":"You have exceeded a secondary rate limit."}',
		json: {},
	}));
	await assert.rejects(api.getTree('vault', 'tree'), /rate limited\. Resuming in ~2 minutes/);
});
test('secondary rate limit without retry-after is recognised from the response body', async () => {
	const api = load(async () => ({
		status: 403,
		headers: { 'x-ratelimit-remaining': '4000' },
		text: '{"message":"You have exceeded a secondary rate limit."}',
		json: {},
	}));
	await assert.rejects(api.getTree('vault', 'tree'), /rate limited/);
});
test('429 with retry-after is reported as rate limited', async () => {
	const api = load(async () => ({
		status: 429,
		headers: { 'retry-after': '30' },
		text: '',
		json: {},
	}));
	await assert.rejects(api.getTree('vault', 'tree'), /rate limited\. Resuming in ~1 minute\./);
});
