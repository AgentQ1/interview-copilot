/* =====================================================
   Interview Copilot — Popup Launcher
   Stores the user's Gemini key locally and injects the overlay.
   ===================================================== */

const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const statusMsg = document.getElementById('statusMsg');

chrome.storage.local.get('geminiApiKey').then(({ geminiApiKey }) => {
  if (typeof geminiApiKey === 'string' && geminiApiKey) {
    apiKeyInput.value = geminiApiKey;
    statusMsg.textContent = 'API key is saved locally.';
    statusMsg.style.display = 'block';
  }
});

saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  statusMsg.style.display = 'none';

  if (!key) {
    await chrome.storage.local.remove('geminiApiKey');
    statusMsg.textContent = 'Saved key removed.';
    statusMsg.style.display = 'block';
    return;
  }

  await chrome.storage.local.set({ geminiApiKey: key });
  statusMsg.textContent = 'API key saved locally.';
  statusMsg.style.display = 'block';
});

document.getElementById('launchBtn').addEventListener('click', async () => {
  const btn = document.getElementById('launchBtn');
  const err = document.getElementById('errMsg');
  btn.disabled = true;
  btn.textContent = 'Launching...';
  err.style.display = 'none';

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'INJECT_OVERLAY' });
    if (resp?.error) throw new Error(resp.error);
    window.close();
  } catch (e) {
    err.textContent = e.message || 'Failed to launch. Make sure you are on a regular web page.';
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '🚀 Launch on This Tab';
  }
});
