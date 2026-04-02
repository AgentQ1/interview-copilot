/* =====================================================
   Interview Copilot — Overlay Content Script
   Injected into the active tab. Creates a floating,
   draggable panel with speech recognition + answer UI.
   ===================================================== */

(function () {
  'use strict';

  // Guard against double-injection
  if (document.getElementById('ic-overlay-root')) {
    // Already open — toggle visibility
    const existing = document.getElementById('ic-overlay-root');
    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
    return;
  }

  // ─── State ──────────────────────────────────────────
  const state = {
    isListening: false,
    recognition: null,
    currentQuestion: '',
    currentMode: '15s',
    answers: { '15s': '', STAR: '', bullets: '' },
  };

  const INTERROGATIVES = [
    'tell me', 'describe', 'explain', 'walk me through',
    'how do', 'how did', 'how would', 'how have',
    'what is', 'what are', 'what was', 'what were', 'what would',
    'why do', 'why did', 'why are', 'why would',
    'can you', 'could you', 'would you',
    'where do', 'where did', 'where would',
    'have you', 'do you', 'did you',
  ];

  function isQuestion(text) {
    const tl = text.toLowerCase().trim();
    if (tl.endsWith('?')) return true;
    return INTERROGATIVES.some(p => tl.startsWith(p));
  }

  function questionConfidence(text) {
    const tl = text.toLowerCase();
    let score = 0.5;
    if (tl.trim().endsWith('?')) score += 0.3;
    if (INTERROGATIVES.some(p => tl.startsWith(p))) score += 0.15;
    return Math.min(score, 1.0);
  }

  function tagQuestion(text) {
    const tl = text.toLowerCase();
    const tags = [];
    const checks = [
      [['strength', 'excel', 'good at', 'best'], 'Strengths'],
      [['weakness', 'improve', 'area'], 'Growth'],
      [['challenge', 'difficult', 'hard', 'obstacle', 'fail'], 'Behavioral'],
      [['yourself', 'background', 'experience', 'walk me'], 'Background'],
      [['team', 'conflict', 'collaborate'], 'Teamwork'],
      [['technical', 'architect', 'design', 'system', 'scale'], 'Technical'],
      [['why', 'interest', 'motivated', 'reason'], 'Motivation'],
    ];
    checks.forEach(([keywords, tag]) => {
      if (keywords.some(k => tl.includes(k))) tags.push(tag);
    });
    if (tags.length === 0) tags.push('General');
    return tags;
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ─── Create Shadow DOM ──────────────────────────────
  const root = document.createElement('div');
  root.id = 'ic-overlay-root';
  root.style.cssText = 'all:initial; position:fixed; z-index:2147483647; top:20px; right:20px; font-family:system-ui,-apple-system,sans-serif;';
  document.body.appendChild(root);
  const shadow = root.attachShadow({ mode: 'closed' });

  // ─── Styles ─────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .panel {
      width: 380px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
      font-size: 13px;
      color: #111;
      line-height: 1.45;
      border: 1px solid #e5e5e5;
      resize: both;
      min-width: 300px;
      min-height: 200px;
    }

    /* ─ Header / Drag Handle ─ */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: linear-gradient(135deg, #4F7FFF 0%, #3B5FCC 100%);
      color: #fff;
      cursor: grab;
      user-select: none;
    }
    .header:active { cursor: grabbing; }
    .header-left { display: flex; align-items: center; gap: 6px; }
    .header-right { display: flex; align-items: center; gap: 4px; }
    .app-name { font-size: 12px; font-weight: 700; letter-spacing: .02em; }
    .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #fff3; }
    .live-dot.on { background: #22C55E; animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .hdr-btn {
      background: rgba(255,255,255,0.15);
      border: none;
      color: #fff;
      font-size: 13px;
      width: 24px; height: 24px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hdr-btn:hover { background: rgba(255,255,255,0.3); }

    /* ─ Body ─ */
    .body {
      max-height: 420px;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .body::-webkit-scrollbar { width: 4px; }
    .body::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }

    /* ─ Controls ─ */
    .controls {
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      border-bottom: 1px solid #eee;
    }
    .btn {
      flex: 1;
      padding: 6px 10px;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .15s;
    }
    .btn:disabled { opacity: .4; cursor: not-allowed; }
    .btn-start { background: #4F7FFF; color: #fff; }
    .btn-stop { background: #EF4444; color: #fff; flex: 0 0 auto; }

    /* ─ Status ─ */
    .status {
      padding: 4px 12px;
      font-size: 11px;
      color: #888;
      background: #fafafa;
      border-bottom: 1px solid #eee;
    }

    /* ─ Section ─ */
    .section { border-bottom: 1px solid #eee; }
    .section-hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #888;
      cursor: pointer;
      user-select: none;
    }

    /* ─ Transcript ─ */
    .transcript {
      max-height: 90px;
      overflow-y: auto;
      padding: 0 12px 6px;
      transition: max-height .2s;
    }
    .transcript.collapsed { max-height: 0; overflow: hidden; padding: 0 12px; }
    .t-empty { font-size: 11px; color: #aaa; text-align: center; padding: 8px 0; }
    .t-item { padding: 3px 0; border-bottom: 1px solid #f5f5f5; }
    .t-item:last-child { border: none; }
    .t-speaker { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #4F7FFF; }
    .t-text { font-size: 12px; color: #111; }
    .t-item.partial .t-text { color: #aaa; font-style: italic; }

    /* ─ Question ─ */
    .q-area { padding: 0 12px 6px; }
    .q-empty { font-size: 11px; color: #aaa; text-align: center; padding: 10px 0; }
    .q-card { display: flex; flex-direction: column; gap: 4px; }
    .q-tags { display: flex; gap: 3px; flex-wrap: wrap; }
    .tag {
      font-size: 9px; font-weight: 600;
      padding: 1px 6px; border-radius: 8px;
      background: #EEF3FF; color: #4F7FFF;
    }
    .q-text {
      font-size: 12px; font-weight: 600;
      padding: 6px 8px;
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 6px;
    }
    .confidence {
      font-size: 9px; font-weight: 600;
      color: #4F7FFF; background: #EEF3FF;
      padding: 1px 6px; border-radius: 8px;
    }

    /* ─ Tabs ─ */
    .tabs {
      display: flex;
      padding: 0 12px;
      margin-bottom: 4px;
    }
    .tab {
      flex: 1; padding: 4px 0;
      text-align: center;
      font-size: 10px; font-weight: 600;
      color: #888;
      background: #fafafa;
      border: 1px solid #eee;
      border-bottom: none;
      cursor: pointer;
    }
    .tab:first-child { border-radius: 5px 0 0 0; }
    .tab:last-child { border-radius: 0 5px 0 0; }
    .tab.active { background: #fff; color: #4F7FFF; border-bottom: 2px solid #4F7FFF; }

    /* ─ Answer ─ */
    .a-area { padding: 0 12px 8px; min-height: 50px; }
    .a-empty { font-size: 11px; color: #aaa; text-align: center; padding: 10px 0; }
    .a-content {
      font-size: 12px; line-height: 1.5; color: #111;
      padding: 8px 10px;
      background: #fff;
      border: 1px solid #eee;
      border-radius: 6px;
      white-space: pre-wrap;
      max-height: 160px;
      overflow-y: auto;
    }
    .a-content .star-label { font-weight: 700; color: #4F7FFF; }

    .copy-btn {
      background: none;
      border: 1px solid #eee;
      border-radius: 5px;
      color: #888;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      padding: 2px 6px;
    }
    .copy-btn:hover { background: #f5f5f5; }

    /* Loading dots */
    .dots { display: flex; gap: 3px; justify-content: center; padding: 12px 0; }
    .dots span {
      width: 5px; height: 5px; border-radius: 50%;
      background: #4F7FFF;
      animation: dp 1.2s ease-in-out infinite;
    }
    .dots span:nth-child(2) { animation-delay: .15s; }
    .dots span:nth-child(3) { animation-delay: .3s; }
    @keyframes dp { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }

    /* ─ Minimized ─ */
    .panel.minimized .body { display: none; }
    .panel.minimized { width: auto !important; height: auto !important; min-width: 0; min-height: 0; }
  `;
  shadow.appendChild(style);

  // ─── Build HTML ─────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="header" id="dragHandle">
      <div class="header-left">
        <div class="live-dot" id="liveDot"></div>
        <span class="app-name">Interview Copilot</span>
      </div>
      <div class="header-right">
        <button class="hdr-btn" id="minimizeBtn" title="Minimize">−</button>
        <button class="hdr-btn" id="closeBtn" title="Close">✕</button>
      </div>
    </div>
    <div class="body">
      <div class="controls">
        <button class="btn btn-start" id="startBtn">▶ Start</button>
        <button class="btn btn-stop" id="stopBtn" disabled>⏹ Stop</button>
      </div>
      <div class="status" id="statusBar">Click Start to begin monitoring</div>

      <div class="section">
        <div class="section-hdr" id="tToggle">
          <span>🎙 Live Transcript</span>
          <span id="tChev">▾</span>
        </div>
        <div class="transcript" id="tList">
          <div class="t-empty">Transcript will appear here...</div>
        </div>
      </div>

      <div class="section">
        <div class="section-hdr">
          <span>💡 Detected Question</span>
          <span class="confidence" id="confBadge"></span>
        </div>
        <div class="q-area">
          <div class="q-empty" id="qEmpty">Waiting for questions...</div>
          <div class="q-card" id="qCard" style="display:none">
            <div class="q-tags" id="qTags"></div>
            <div class="q-text" id="qText"></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-hdr">
          <span>✍️ Suggested Answer</span>
          <button class="copy-btn" id="copyBtn">⎘ Copy</button>
        </div>
        <div class="tabs" id="aTabs">
          <div class="tab active" data-m="15s">15 sec</div>
          <div class="tab" data-m="STAR">STAR</div>
          <div class="tab" data-m="bullets">Bullets</div>
        </div>
        <div class="a-area">
          <div class="a-empty" id="aEmpty">Answers will appear once a question is detected.</div>
          <div class="a-content" id="aContent" style="display:none"></div>
        </div>
      </div>
    </div>
  `;
  shadow.appendChild(panel);

  // ─── DOM Refs ───────────────────────────────────────
  const $ = id => shadow.getElementById(id);
  const dom = {
    panel, liveDot: $('liveDot'), startBtn: $('startBtn'), stopBtn: $('stopBtn'),
    statusBar: $('statusBar'), tList: $('tList'), tToggle: $('tToggle'), tChev: $('tChev'),
    qEmpty: $('qEmpty'), qCard: $('qCard'), qText: $('qText'), qTags: $('qTags'),
    confBadge: $('confBadge'), aEmpty: $('aEmpty'), aContent: $('aContent'),
    aTabs: $('aTabs'), copyBtn: $('copyBtn'), minimizeBtn: $('minimizeBtn'),
    closeBtn: $('closeBtn'), dragHandle: $('dragHandle'),
  };

  // ─── Drag Logic ─────────────────────────────────────
  let isDragging = false, dragX = 0, dragY = 0;
  dom.dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hdr-btn')) return; // Don't drag on buttons
    isDragging = true;
    dragX = e.clientX - root.offsetLeft;
    dragY = e.clientY - root.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    root.style.left = (e.clientX - dragX) + 'px';
    root.style.top = (e.clientY - dragY) + 'px';
    root.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });

  // ─── Minimize / Close ───────────────────────────────
  dom.minimizeBtn.addEventListener('click', () => {
    panel.classList.toggle('minimized');
    dom.minimizeBtn.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
  dom.closeBtn.addEventListener('click', () => {
    stopListening();
    root.remove();
  });

  // ─── Transcript Toggle ──────────────────────────────
  dom.tToggle.addEventListener('click', () => {
    dom.tList.classList.toggle('collapsed');
    dom.tChev.textContent = dom.tList.classList.contains('collapsed') ? '▸' : '▾';
  });

  // ─── Speech Recognition ─────────────────────────────
  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStatus('Speech Recognition not available on this page.');
      return;
    }

    state.recognition = new SR();
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.lang = 'en-US';
    state.isListening = true;

    state.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) {
          addTranscript(text);
          if (isQuestion(text)) processQuestion(text);
        } else {
          showPartial(text);
        }
      }
    };

    state.recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      setStatus('Mic error: ' + event.error);
    };

    state.recognition.onend = () => {
      if (state.isListening) {
        try { state.recognition.start(); } catch (e) {}
      }
    };

    state.recognition.start();
    state.isListening = true;
    dom.liveDot.classList.add('on');
    dom.startBtn.disabled = true;
    dom.stopBtn.disabled = false;
    setStatus('Listening...');
  }

  function stopListening() {
    state.isListening = false;
    if (state.recognition) {
      state.recognition.onend = null;
      state.recognition.stop();
      state.recognition = null;
    }
    dom.liveDot.classList.remove('on');
    dom.startBtn.disabled = false;
    dom.stopBtn.disabled = true;
    setStatus('Stopped.');
  }

  // ─── UI Helpers ─────────────────────────────────────
  function setStatus(msg) { dom.statusBar.textContent = msg; }

  function addTranscript(text) {
    const empty = dom.tList.querySelector('.t-empty');
    if (empty) empty.remove();
    const partial = dom.tList.querySelector('.t-item.partial');
    if (partial) partial.remove();

    const d = document.createElement('div');
    d.className = 't-item';
    d.innerHTML = `<div class="t-speaker">Speaker</div><div class="t-text">${esc(text)}</div>`;
    dom.tList.appendChild(d);
    dom.tList.scrollTop = dom.tList.scrollHeight;
  }

  function showPartial(text) {
    let p = dom.tList.querySelector('.t-item.partial');
    if (!p) {
      const empty = dom.tList.querySelector('.t-empty');
      if (empty) empty.remove();
      p = document.createElement('div');
      p.className = 't-item partial';
      p.innerHTML = `<div class="t-speaker">Speaker</div><div class="t-text"></div>`;
      dom.tList.appendChild(p);
    }
    p.querySelector('.t-text').textContent = text;
    dom.tList.scrollTop = dom.tList.scrollHeight;
  }

  async function processQuestion(question) {
    state.currentQuestion = question;
    const tags = tagQuestion(question);
    const conf = questionConfidence(question);

    dom.qEmpty.style.display = 'none';
    dom.qCard.style.display = 'flex';
    dom.qText.textContent = question;
    dom.qTags.innerHTML = '';
    tags.forEach(t => {
      const s = document.createElement('span');
      s.className = 'tag';
      s.textContent = t;
      dom.qTags.appendChild(s);
    });
    dom.confBadge.textContent = Math.round(conf * 100) + '%';

    // Show loading
    dom.aEmpty.style.display = 'none';
    dom.aContent.style.display = 'block';
    dom.aContent.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';

    state.answers = { '15s': '', STAR: '', bullets: '' };

    try {
      const answer = await getAnswer(question, state.currentMode);
      state.answers[state.currentMode] = answer;
      renderAnswer(answer);
    } catch (err) {
      dom.aContent.textContent = 'Error: ' + err.message;
    }
  }

  function renderAnswer(text) {
    if (!text) {
      dom.aContent.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
      return;
    }
    const formatted = esc(text)
      .replace(/\*\*(Situation|Task|Action|Result):\*\*/g, '<span class="star-label">$1:</span>')
      .replace(/(Situation:|Task:|Action:|Result:)/g, '<span class="star-label">$1</span>');
    dom.aContent.innerHTML = formatted;
  }

  async function getAnswer(question, mode) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GENERATE_ANSWER', question, mode }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (resp?.error) return reject(new Error(resp.error));
        resolve(resp.answer);
      });
    });
  }

  // ─── Tabs ───────────────────────────────────────────
  dom.aTabs.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const mode = tab.dataset.m;
      state.currentMode = mode;
      dom.aTabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.m === mode));
      if (state.answers[mode]) { renderAnswer(state.answers[mode]); return; }
      if (state.currentQuestion) {
        dom.aContent.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
        try {
          const answer = await getAnswer(state.currentQuestion, mode);
          state.answers[mode] = answer;
          renderAnswer(answer);
        } catch (err) { dom.aContent.textContent = 'Error: ' + err.message; }
      }
    });
  });

  // ─── Buttons ────────────────────────────────────────
  dom.startBtn.addEventListener('click', () => startListening());
  dom.stopBtn.addEventListener('click', () => stopListening());
  dom.copyBtn.addEventListener('click', () => {
    const text = state.answers[state.currentMode];
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      dom.copyBtn.textContent = '✓ Copied';
      setTimeout(() => { dom.copyBtn.textContent = '⎘ Copy'; }, 1200);
    });
  });

})();
