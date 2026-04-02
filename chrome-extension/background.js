/* =====================================================
   Interview Copilot — Background Service Worker
   Injects overlay into active tab and handles Gemini API.
   ===================================================== */

const GEMINI_API_KEY = 'AIzaSyBnrrLWz-tQkq-wloKTPS-JLzevKqsmeZY';
const GEMINI_MODEL = 'gemini-2.5-flash';

// ─── Gemini API ─────────────────────────────────────
function buildPrompt(question, mode) {
  let instructions = '';
  switch (mode) {
    case '15s':
      instructions = `Write a concise 2-3 sentence spoken answer (15-second verbal response).
- Start with a strong, confident opening statement.
- Sound natural and human, not robotic or formal.
- Do NOT use bullet points, headers, or markdown formatting.
Output ONLY the answer text, nothing else.`;
      break;
    case 'STAR':
      instructions = `Write the answer using the STAR method with these sections:
**Situation:** (1-2 sentences)
**Task:** (1-2 sentences)
**Action:** (2-3 sentences)
**Result:** (1-2 sentences with metrics if possible)
Output ONLY the answer text, nothing else.`;
      break;
    case 'bullets':
      instructions = `Write the answer as 4-6 concise bullet points.
- Each bullet should be 1-2 sentences.
- Start with the most impactful point.
- Include specific details and metrics where relevant.
Output ONLY the bullet points, nothing else.`;
      break;
  }

  return `You are an expert interview coach helping a candidate answer interview questions.

## Interview Question
${question}

## Instructions
${instructions}`;
}

async function generateAnswer(question, mode) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{
      parts: [{ text: buildPrompt(question, mode) }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 512,
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    throw new Error('Empty response from Gemini');
  }

  return candidate.content.parts[0].text;
}

// ─── Message Handler ──────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Inject the floating overlay into the active tab
  if (message.type === 'INJECT_OVERLAY') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: 'No active tab found' });
        return;
      }
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url || '';

      // Can't inject into chrome://, edge://, about:, or extension pages
      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') ||
          tabUrl.startsWith('about:') || tabUrl.startsWith('chrome-extension://')) {
        sendResponse({ error: 'Cannot inject into this page. Navigate to a regular website first (e.g. meet.google.com).' });
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId },
        files: ['overlay.js'],
      }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true });
        }
      });
    });
    return true; // async
  }

  // Generate answer via Gemini API
  if (message.type === 'GENERATE_ANSWER') {
    generateAnswer(message.question, message.mode)
      .then(answer => sendResponse({ answer }))
      .catch(err => sendResponse({ error: err.message }));
    return true; // async
  }

  return false;
});
