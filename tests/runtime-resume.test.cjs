const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./runtime-harness.cjs');

// On iOS and Android a backgrounded Obsidian is paused, timers included, and
// resumed without restarting: neither the periodic interval nor the startup
// sync runs. Coming back to the foreground must sync on its own.

function setup() {
	const h = harness(),
		p = h.plugin();
	let calls = 0;
	p.triggerSync = async (isAuto) => {
		assert.equal(isAuto, true, 'a resume sync is an automatic sync');
		calls++;
	};
	p.settings.lastSyncTime = 0;
	return { h, p, calls: () => calls };
}

test('sync on resume is on by default', () => {
	const h = harness();
	assert.equal(h.load('types').DEFAULT_SETTINGS.syncOnResume, true);
});

test('returning to the foreground syncs', () => {
	const { p, calls } = setup();
	p.handleVisibilityChange('visible', 10 * 60_000);
	assert.equal(calls(), 1);
});

test('going to the background does not sync', () => {
	const { p, calls } = setup();
	p.handleVisibilityChange('hidden', 10 * 60_000);
	assert.equal(calls(), 0);
});

test('the setting turns resume sync off', () => {
	const { p, calls } = setup();
	p.settings.syncOnResume = false;
	p.handleVisibilityChange('visible', 10 * 60_000);
	assert.equal(calls(), 0);
});

test('a return shortly after a sync is skipped, a later one syncs', () => {
	const { p, calls } = setup();
	p.settings.lastSyncTime = 1_000_000;
	p.handleVisibilityChange('visible', 1_000_000 + 29_000);
	assert.equal(calls(), 0, 'within 30 s of the last sync');
	p.handleVisibilityChange('visible', 1_000_000 + 31_000);
	assert.equal(calls(), 1, 'after 30 s');
});

test('resume sync is independent of the periodic schedule, like startup sync', () => {
	const { p, calls } = setup();
	p.settings.autoSyncEnabled = false;
	p.settings.syncFrequencyMinutes = 0;
	p.handleVisibilityChange('visible', 10 * 60_000);
	assert.equal(calls(), 1);
});

test('no resume sync before the token and username are set', () => {
	const { p, calls } = setup();
	p.settings.personalAccessToken = '';
	p.handleVisibilityChange('visible', 10 * 60_000);
	assert.equal(calls(), 0);
});

test('onload listens for visibility changes on the document', async () => {
	const { h, p, calls } = setup();
	const listeners = [];
	const doc = { visibilityState: 'hidden' };
	h.context.document = doc;
	const noop = () => ({});
	p.app = {
		workspace: { onLayoutReady: () => {}, on: noop },
		vault: { getName: () => 'fixture' },
	};
	p.loadSettings = async () => {};
	p.addStatusBarItem = () => new h.Element();
	p.addSettingTab = noop;
	p.addRibbonIcon = noop;
	p.addCommand = noop;
	p.registerEvent = noop;
	p.registerDomEvent = (target, type, fn) => listeners.push({ target, type, fn });
	await p.onload();
	const l = listeners.find((x) => x.type === 'visibilitychange');
	assert.ok(l, 'a visibilitychange listener is registered');
	assert.equal(l.target, doc, 'on the document');
	doc.visibilityState = 'visible';
	l.fn();
	assert.equal(calls(), 1, 'the listener runs the resume sync');
});

test('the settings tab shows the resume toggle next to the startup one', () => {
	const h = harness();
	const Tab = h.load('settings').GitHubSyncSettingTab;
	const tab = new Tab({ vault: { getName: () => 'fixture' } }, { settings: {} });
	const items = tab.getSettingDefinitions().flatMap((d) => d.items || []);
	const keys = items.map((d) => d.control?.key);
	const resume = items.find((d) => d.control?.key === 'syncOnResume');
	assert.equal(resume.control.type, 'toggle');
	assert.match(resume.desc, /background/i);
	assert.equal(keys.indexOf('syncOnResume'), keys.indexOf('autoPullOnStartup') + 1);
});
