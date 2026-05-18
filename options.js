const input    = document.getElementById('apiKeyInput');
const saveBtn  = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const status   = document.getElementById('status');
const eyeOpen  = document.getElementById('eyeOpen');
const eyeClosed = document.getElementById('eyeClosed');

// Load saved key on open
chrome.storage.sync.get('apiKey', data => {
  if (data.apiKey) input.value = data.apiKey;
});

// Toggle visibility
document.getElementById('toggleVisibility').addEventListener('click', () => {
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  eyeOpen.classList.toggle('hidden', isPassword);
  eyeClosed.classList.toggle('hidden', !isPassword);
});

// Save
saveBtn.addEventListener('click', () => {
  const key = input.value.trim();
  if (!key) {
    showStatus('Please enter an API key.', 'error');
    return;
  }
  if (!key.startsWith('sk-ant-')) {
    showStatus('That doesn\'t look like an Anthropic API key. Keys start with "sk-ant-".', 'error');
    return;
  }
  chrome.storage.sync.set({ apiKey: key }, () => {
    showStatus('API key saved successfully.', 'success');
  });
});

// Clear
clearBtn.addEventListener('click', () => {
  chrome.storage.sync.remove('apiKey', () => {
    input.value = '';
    showStatus('API key cleared.', 'success');
  });
});

function showStatus(msg, type) {
  status.textContent = msg;
  status.className = `status ${type}`;
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    status.className = 'status hidden';
  }, 3000);
}
