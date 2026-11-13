const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./runtime-harness.cjs');

test('progress detail is visible in desktop text and mobile tooltip', () => {
	for (const mobile of [false, true]) {
		const h = harness(),
			p = h.plugin();
		h.obsidian.Platform.isMobile = mobile;
		p.statusBarEl = new h.Element();
		delete p.updateStatusBar;
		p.updateStatusBar('syncing', 'Downloading 2/4');
		assert.match(p.statusBarEl.title, /Downloading 2[/]4/);
		assert.match(p.statusBarEl.children[1].text, /Downloading 2[/]4/);
	}
});

test('configured startup is unchecked rather than falsely offline or synced', async () => {
	const h = harness(),
		p = h.plugin();
	p.loadSettings = async () => {};
	p.initEngine = () => {};
	p.addStatusBarItem = () => new h.Element();
	p.addSettingTab = () => {};
	p.addRibbonIcon = () => {};
	p.addCommand = () => {};
	p.registerEvent = () => {};
	p.app = { vault: {}, workspace: { onLayoutReady() {}, on() {} } };
	await p.onload();
	assert.equal(p.statuses[0][0], 'ready');
});

test('the not checked state offers a manual sync', () => {
	const h = harness(),
		p = h.plugin();
	p.statusBarEl = new h.Element();
	delete p.updateStatusBar;
	p.updateStatusBar('ready');
	assert.equal(p.statusBarEl.children[1].text, ' Not checked');
	assert.ok(p.statusBarEl.onclick, 'the status bar triggers a sync');
});
