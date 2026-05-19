// ─── State ───────────────────────────────────────────────────────────────────

let imageBase64 = null;
let imageMediaType = null;
let lastExtracted = null;
let inputMode = 'screenshot'; // 'screenshot' | 'text'

// ─── DOM ──────────────────────────────────────────────────────────────────────

const sections = {
  noKey:   document.getElementById('noKeySection'),
  upload:  document.getElementById('uploadSection'),
  preview: document.getElementById('previewSection'),
  loading: document.getElementById('loadingSection'),
  results: document.getElementById('resultsSection'),
  error:   document.getElementById('errorSection'),
};

function showOnly(name) {
  Object.entries(sections).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const apiKey = await getApiKey();

  if (!apiKey) {
    showOnly('noKey');
    return;
  }

  // Consume any data queued by the background context-menu handler
  const stored = await new Promise(r => chrome.storage.local.get('pendingExtraction', r));
  if (stored.pendingExtraction) {
    chrome.storage.local.remove('pendingExtraction');
    chrome.action.setBadgeText({ text: '' });
    processPending(stored.pendingExtraction);
    return;
  }

  showOnly('upload');
}

function processPending(pending) {
  if (pending.type === 'image') {
    imageBase64    = pending.base64;
    imageMediaType = pending.mediaType;
    previewImg.src = `data:${pending.mediaType};base64,${pending.base64}`;
    showOnly('preview');
  } else if (pending.type === 'text') {
    setInputMode('text');
    document.getElementById('textInput').value = pending.text;
    showOnly('upload');
  } else if (pending.type === 'error') {
    showOnly('upload');
    showContextMenuError(pending.message);
  }
}

// Brief inline error banner shown when the context-menu image fetch fails
function showContextMenuError(msg) {
  const existing = document.getElementById('ctxError');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'ctxError';
  el.className = 'ctx-error';
  el.textContent = msg;

  const upload = document.getElementById('uploadSection');
  upload.insertBefore(el, upload.firstChild);
  setTimeout(() => el.remove(), 5000);
}

init();

// ─── Storage ──────────────────────────────────────────────────────────────────

function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get('apiKey', data => resolve(data.apiKey || ''));
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('goToSettingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── Mode toggle ──────────────────────────────────────────────────────────────

document.getElementById('modeScreenshot').addEventListener('click', () => setInputMode('screenshot'));
document.getElementById('modeText').addEventListener('click', () => setInputMode('text'));

function setInputMode(mode) {
  inputMode = mode;
  document.getElementById('screenshotMode').classList.toggle('hidden', mode !== 'screenshot');
  document.getElementById('textMode').classList.toggle('hidden', mode !== 'text');
  document.getElementById('modeScreenshot').classList.toggle('active', mode === 'screenshot');
  document.getElementById('modeText').classList.toggle('active', mode === 'text');
}

// ─── File Handling ────────────────────────────────────────────────────────────

const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const previewImg = document.getElementById('previewImg');

document.getElementById('browseBtn').addEventListener('click', () => {
  fileInput.click();
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// Paste from clipboard (Ctrl+V / Cmd+V) — images only in screenshot mode
document.addEventListener('paste', e => {
  if (inputMode !== 'screenshot') return; // textarea handles its own paste
  if (!sections.loading.classList.contains('hidden')) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) { handleFile(file); break; }
    }
  }
});

document.getElementById('changeImgBtn').addEventListener('click', () => {
  fileInput.value = '';
  showOnly('upload');
});

function handleFile(file) {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!allowed.includes(file.type)) {
    showError('Please upload a PNG or JPEG image.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showError('Image is too large. Please use an image under 5 MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    // dataUrl = "data:image/png;base64,..."
    const [meta, data] = dataUrl.split(',');
    imageBase64 = data;
    imageMediaType = meta.replace('data:', '').replace(';base64', '');
    previewImg.src = dataUrl;
    showOnly('preview');
  };
  reader.readAsDataURL(file);
}

// ─── Extract ──────────────────────────────────────────────────────────────────

document.getElementById('extractBtn').addEventListener('click', runExtraction);
document.getElementById('textExtractBtn').addEventListener('click', runExtraction);

async function runExtraction() {
  const apiKey = await getApiKey();
  if (!apiKey) { showOnly('noKey'); return; }

  if (inputMode === 'text') {
    const text = document.getElementById('textInput').value.trim();
    if (!text) return;
    showOnly('loading');
    try {
      const data = await callClaudeAPIText(apiKey, text);
      if (data.error) { showError('No calendar event found in this text.'); return; }
      lastExtracted = data;
      renderResults(data);
      showOnly('results');
    } catch (err) {
      showError(err.message || 'Failed to extract data. Please try again.');
    }
    return;
  }

  // Screenshot mode
  if (!imageBase64) return;
  showOnly('loading');
  try {
    const data = await callClaudeAPI(apiKey, imageBase64, imageMediaType);
    if (data.error) { showError(`No calendar event found in this screenshot.`); return; }
    lastExtracted = data;
    renderResults(data);
    showOnly('results');
  } catch (err) {
    showError(err.message || 'Failed to extract data. Please try again.');
  }
}

// ─── Claude API ───────────────────────────────────────────────────────────────

function todayContext() {
  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dow = days[now.getDay()];
  const mon = months[now.getMonth()];
  const day = now.getDate();
  const year = now.getFullYear();
  const iso  = `${year}-${String(now.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return `Today is ${dow}, ${mon} ${day}, ${year} (${iso}). Use this as the reference point to resolve any relative date expressions in the input (e.g. "tomorrow", "next Friday", "in two weeks") into exact YYYY-MM-DD dates.`;
}

async function callClaudeAPI(apiKey, base64Data, mediaType) {
  const prompt = `${todayContext()}

Analyze this screenshot and extract any calendar event information present.

Return a JSON object with exactly these fields:
{
  "title": "event name or null if not found",
  "date": "date in YYYY-MM-DD format if determinable, otherwise the raw date text found, or null",
  "startTime": "start time in HH:MM (24-hour) format if determinable, or null",
  "endTime": "end time in HH:MM (24-hour) format if determinable, or null",
  "location": "physical address, venue name, or virtual meeting link/platform, or null",
  "description": "any additional event details, agenda items, or notes, or null"
}

If no calendar event information is visible in the screenshot, return:
{"error": "No calendar event found in image"}

Return ONLY valid JSON. No markdown, no explanation, no code blocks.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    let msg = `API error (${response.status})`;
    try {
      const body = await response.json();
      if (body.error?.message) msg = body.error.message;
      if (response.status === 401) msg = 'Invalid API key. Check your settings.';
      if (response.status === 429) msg = 'Rate limit reached. Please wait a moment and try again.';
    } catch {}
    throw new Error(msg);
  }

  const result = await response.json();
  const rawText = result.content?.[0]?.text?.trim() ?? '';

  // Strip markdown code fences if Claude included them
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');

  return JSON.parse(cleaned);
}

async function callClaudeAPIText(apiKey, text) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `${todayContext()}

Extract calendar event information from the following text.

Return a JSON object with exactly these fields:
{
  "title": "event name or null if not found",
  "date": "date in YYYY-MM-DD format if determinable, otherwise the raw date text found, or null",
  "startTime": "start time in HH:MM (24-hour) format if determinable, or null",
  "endTime": "end time in HH:MM (24-hour) format if determinable, or null",
  "location": "physical address, venue name, or virtual meeting link/platform, or null",
  "description": "any additional event details, agenda items, or notes, or null"
}

If no calendar event information is present, return:
{"error": "No calendar event found"}

Return ONLY valid JSON. No markdown, no explanation.

Text to extract from:
"""
${text}
"""`,
      }],
    }),
  });

  if (!response.ok) {
    let msg = `API error (${response.status})`;
    try {
      const body = await response.json();
      if (body.error?.message) msg = body.error.message;
      if (response.status === 401) msg = 'Invalid API key. Check your settings.';
      if (response.status === 429) msg = 'Rate limit reached. Please wait a moment and try again.';
    } catch {}
    throw new Error(msg);
  }

  const result = await response.json();
  const rawText = result.content?.[0]?.text?.trim() ?? '';
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  return JSON.parse(cleaned);
}

// ─── Render Results ───────────────────────────────────────────────────────────

function renderResults(data) {
  // Banner title (dark card)
  const banner = document.getElementById('bannerTitle');
  if (data.title) {
    banner.textContent = data.title;
    banner.classList.remove('empty');
  } else {
    banner.textContent = 'Untitled Event';
    banner.classList.add('empty');
  }

  setField('valDate',        formatDate(data.date));
  setField('valTime',        formatTime(data.startTime, data.endTime));
  setField('valLocation',    data.location);
  setField('valDescription', data.description);
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (value) {
    el.textContent = value;
    el.classList.remove('empty');
  } else {
    el.textContent = '—';
    el.classList.add('empty');
  }
}

function formatDate(date) {
  if (!date) return null;
  // If it looks like YYYY-MM-DD, format nicely
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    if (!isNaN(d)) {
      return d.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    }
  }
  return date;
}

function formatTime(start, end) {
  if (!start) return null;
  const fmt = t => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

// ─── Calendar Actions ─────────────────────────────────────────────────────────

document.getElementById('googleCalBtn').addEventListener('click', () => {
  if (!lastExtracted) return;
  const url = buildGoogleCalendarUrl(lastExtracted);
  chrome.tabs.create({ url });
});

document.getElementById('icsBtn').addEventListener('click', () => {
  if (!lastExtracted) return;
  const ics = generateICS(lastExtracted);
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(lastExtracted.title || 'event')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
});

function buildGoogleCalendarUrl(data) {
  const p = new URLSearchParams({ action: 'TEMPLATE' });
  if (data.title)       p.set('text', data.title);
  if (data.location)    p.set('location', data.location);
  if (data.description) p.set('details', data.description);

  const dateStr = toDateStr(data.date);
  if (dateStr && data.startTime) {
    const start = `${dateStr}T${data.startTime.replace(':', '')}00`;
    const end   = data.endTime
      ? `${dateStr}T${data.endTime.replace(':', '')}00`
      : offsetHour(dateStr, data.startTime, 1);
    p.set('dates', `${start}/${end}`);
  } else if (dateStr) {
    const next = nextDay(dateStr);
    p.set('dates', `${dateStr}/${next}`);
  }

  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function generateICS(data) {
  const uid   = `${Date.now()}@addendar`;
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Addender//Calendar Extractor//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
  ];

  const dateStr = toDateStr(data.date);
  if (dateStr && data.startTime) {
    const start = `${dateStr}T${data.startTime.replace(':', '')}00`;
    const end   = data.endTime
      ? `${dateStr}T${data.endTime.replace(':', '')}00`
      : offsetHour(dateStr, data.startTime, 1);
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else if (dateStr) {
    lines.push(`DTSTART;VALUE=DATE:${dateStr}`, `DTEND;VALUE=DATE:${nextDay(dateStr)}`);
  }

  if (data.title)       lines.push(`SUMMARY:${icsEscape(data.title)}`);
  if (data.location)    lines.push(`LOCATION:${icsEscape(data.location)}`);
  if (data.description) lines.push(`DESCRIPTION:${icsEscape(data.description)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

// ─── Date / Time Helpers ──────────────────────────────────────────────────────

function toDateStr(date) {
  if (!date) return null;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

function offsetHour(dateStr, timeStr, hours) {
  const [h, m] = timeStr.split(':').map(Number);
  const nh = (h + hours) % 24;
  return `${dateStr}T${String(nh).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
}

function nextDay(dateStr) {
  // dateStr is YYYYMMDD
  const y = parseInt(dateStr.slice(0, 4));
  const mo = parseInt(dateStr.slice(4, 6)) - 1;
  const d = parseInt(dateStr.slice(6, 8));
  const next = new Date(y, mo, d + 1);
  return `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
}

function icsEscape(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
}

// ─── Error / Reset ────────────────────────────────────────────────────────────

function showError(msg) {
  document.getElementById('errorMessage').textContent = msg;
  showOnly('error');
}

document.getElementById('retryBtn').addEventListener('click', () => {
  if (imageBase64) {
    showOnly('preview');
  } else {
    showOnly('upload');
  }
});

document.getElementById('errorNewBtn').addEventListener('click', resetToUpload);
document.getElementById('newScreenshotBtn').addEventListener('click', resetToUpload);

function resetToUpload() {
  imageBase64 = null;
  imageMediaType = null;
  lastExtracted = null;
  fileInput.value = '';
  previewImg.src = '';
  document.getElementById('textInput').value = '';
  setInputMode('screenshot');
  showOnly('upload');
}
