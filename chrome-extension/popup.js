/* =====================================================
   Interview Copilot — Popup Launcher
   Injects the floating overlay into the active tab.
   ===================================================== */

document.getElementById('launchBtn').addEventListener('click', async () => {
  const btn = document.getElementById('launchBtn');
  const err = document.getElementById('errMsg');
  btn.disabled = true;
  btn.textContent = 'Launching...';
  err.style.display = 'none';

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'INJECT_OVERLAY' });
    if (resp?.error) throw new Error(resp.error);
    // Close popup after successful injection
    window.close();
  } catch (e) {
    err.textContent = e.message || 'Failed to launch. Make sure you are on a regular web page.';
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '🚀 Launch on This Tab';
  }
});
