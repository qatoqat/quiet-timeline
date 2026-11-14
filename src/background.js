// Toolbar button: ask Quiet Timeline in this tab to toggle its settings panel. If no
// Quiet Timeline answers (not an X tab), open X. Reading tab.url would need the
// "tabs" permission, so don't rely on it.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'xsieve-toggle-panel' });
    if (r && r.ok) return;
  } catch (_) {}
  chrome.tabs.create({ url: 'https://x.com/home' });
});

chrome.runtime.onMessage.addListener((msg) => {
  // Dev helper for tools/cdp.mjs: reload after code edits (unpacked installs only).
  if (msg && msg.type === 'xsieve-dev-reload' && !chrome.runtime.getManifest().update_url) chrome.runtime.reload();
});
