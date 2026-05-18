// ─── Context menu registration ────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addendar-image',
    title: 'Add to Calendar',
    contexts: ['image'],
  });
  
  chrome.contextMenus.create({
    id: 'addendar-text',
    title: 'Add to Calendar',
    contexts: ['selection'],
  });
});

// ─── Click handler ────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'addendar-image') {
    await handleImage(info.srcUrl);
  } else if (info.menuItemId === 'addendar-text') {
    await handleText(info.selectionText);
  }
});

// ─── Image ────────────────────────────────────────────────────────────────────

async function handleImage(srcUrl) {
  try {
    const { base64, mediaType } = await fetchImageAsBase64(srcUrl);
    await store({ type: 'image', base64, mediaType });
  } catch (err) {
    await store({ type: 'error', message: err.message || 'Could not load this image.' });
  }
  badge();
  openPopup();
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (HTTP ${res.status})`);

  const blob = await res.blob();
  if (blob.size > 5 * 1024 * 1024) throw new Error('Image exceeds 5 MB limit.');

  const mediaType = blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const buffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  // Chunked encoding avoids call-stack overflow on large buffers
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
  }

  return { base64: btoa(binary), mediaType };
}

// ─── Text ─────────────────────────────────────────────────────────────────────

async function handleText(selectionText) {
  const text = (selectionText || '').trim();
  if (!text) return;
  await store({ type: 'text', text });
  badge();
  openPopup();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function store(payload) {
  return chrome.storage.local.set({ pendingExtraction: payload });
}

function badge() {
  chrome.action.setBadgeText({ text: '1' });
  chrome.action.setBadgeBackgroundColor({ color: '#123524' });
}

function openPopup() {
  chrome.action.openPopup().catch(() => {});
}
