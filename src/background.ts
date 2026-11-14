// Reading tab.url would need the "tabs" permission, so a missing reply means "not an X tab".
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const r = await chrome.tabs.sendMessage(tab.id!, { type: 'quiettl-toggle-panel' });
    if (r && r.ok) return;
  } catch (_) {}
  chrome.tabs.create({ url: 'https://x.com/home' });
});

chrome.runtime.onMessage.addListener((msg) => {
  // Dev helper for tools/cdp.ts (unpacked installs only).
  if (msg && msg.type === 'quiettl-dev-reload' && !chrome.runtime.getManifest().update_url) chrome.runtime.reload();
});
