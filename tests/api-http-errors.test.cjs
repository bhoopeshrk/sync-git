const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture(respond) {
	const calls = [];
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
		window: {
			setTimeout(callback) {
				callback();
			},
		},
		require(name) {
			assert.equal(name, 'obsidian');
			return {
				async requestUrl(options) {
					calls.push(options);
					const response = await respond(options, calls.length);
					// Obsidian defaults to throwing for HTTP errors, unless explicitly disabled.
					if (response.status >= 400 && options.throw !== false)
						throw new Error('Obsidian HTTP failure');
					return { headers: {}, text: '', json: {}, ...response };
				},
			};
		},
	});
	return {
		calls,
		...module.exports,
		api: new module.exports.GitHubApiClient('synthetic', 'owner', 'https://example.invalid'),
	};
}

for (const [status, message] of [
	[401, /invalid or expired/],
	[403, /Permission denied/],
	[404, /Repository not found/],
	[422, /rejected/],
	[500, /GitHub API error/],
]) {
	test('maps HTTP ' + status + ' into a typed API error', async () => {
		const { api, GitHubApiError } = fixture(() => ({ status, text: 'synthetic failure' }));
		await assert.rejects(
			api.getTree('vault', 'tree'),
			(error) =>
				error instanceof GitHubApiError &&
				error.status === status &&
				message.test(error.message),
		);
	});
}

test('creates a missing repository after typed 404', async () => {
	const { api, calls } = fixture((options, count) => ({ status: count === 1 ? 404 : 201 }));
	await api.ensureRepoExists('vault');
	assert.equal(calls.length, 2);
	assert.equal(calls[1].method, 'POST');
	assert.equal(calls[1].url, 'https://example.invalid/user/repos');
	assert.deepEqual(JSON.parse(calls[1].body), { name: 'vault', private: true, auto_init: true });
});

test('does not create a repository for unrelated errors containing 404', async () => {
	const failure = new Error('Network failure, request identifier 404');
	const { api, calls } = fixture(() => {
		throw failure;
	});
	await assert.rejects(api.ensureRepoExists('vault'), (error) => error === failure);
	assert.equal(calls.length, 1);
});

test('connection test recognizes a missing repository', async () => {
	const { api } = fixture((options, count) => ({ status: count === 1 ? 200 : 404 }));
	const result = await api.testConnection('vault');
	assert.equal(result.success, true);
	assert.match(result.message, /will be created/);
});

test('missing branch is handled through typed 404', async () => {
	const { api, calls } = fixture((options, count) => ({
		status: count === 1 ? 404 : 200,
		json: { sha: 'initial' },
	}));
	assert.equal(await api.getLatestCommitSha('vault'), 'initial');
	assert.equal(calls.length, 4);
	assert.equal(JSON.parse(calls[3].body).ref, 'refs/heads/main');
});

test('transport errors remain unchanged', async () => {
	const failure = new Error('Offline');
	const { api } = fixture(() => {
		throw failure;
	});
	await assert.rejects(api.getTree('vault', 'tree'), (error) => error === failure);
});
