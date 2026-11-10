const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./runtime-harness.cjs');
test('startup setting describes bidirectional writes while preserving persisted key', () => {
	const h = harness();
	const Tab = h.load('settings').GitHubSyncSettingTab;
	const tab = new Tab({ vault: { getName: () => 'fixture' } }, { settings: {} });
	const defs = tab.getSettingDefinitions().flatMap((d) => d.items || []);
	const startup = defs.find((d) => d.control?.key === 'autoPullOnStartup');
	assert.equal(startup.name, 'Auto sync on startup');
	assert.match(startup.desc, /bidirectional/i);
	assert.match(startup.desc, /upload/i);
	assert.match(startup.desc, /delet/i);
});
