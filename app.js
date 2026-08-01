// ============================================================
// Feynman Router — Main App Logic (Web version, no backend)
// ============================================================
// All AI calls go directly to Pollinations.ai from the browser.
// No backend, no API key, 100% free.
// ============================================================

// ============================================================
// State
// ============================================================
const state = {
  view: 'home',
  mode: 'coach',
  topic: '',
  messages: [],
  isThinking: false,
  pinnedPersonaId: null,
  lastPersonaId: null,
  currentPlayer: { id: 'me', name: 'Saya' },
  autoSpeak: true,
  // Closing phrase detection
  closingDismissed: false,
  closingForMsgId: null,
  // Evaluation
  isEvaluating: false,
  evalResult: null,
  evalError: null,
  scoreDropInfo: null,
  // Image attachment
  attachedImage: null, // { base64, mimeType, analysis (string|null), fileName }
  isAnalyzingImage: false,
};

// ============================================================
// DOM helpers
// ============================================================
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatTime(ts) {
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, kind = '') {
  const container = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ============================================================
// Storage
// ============================================================
const KEYS = {
  sessions: 'feynman-sessions-v1',
  evaluations: 'feynman-evaluations-v1',
  targets: 'feynman-targets-v1',
  players: 'feynman-players-v1',
  currentPlayer: 'feynman-current-player-v1',
};

function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

function loadSessions() { return loadJSON(KEYS.sessions, []); }
function saveSessions(s) { saveJSON(KEYS.sessions, s); }
function loadEvaluations() { return loadJSON(KEYS.evaluations, []); }
function saveEvaluation(evalResult, playerName) {
  const stored = {
    id: uid(), topic: evalResult.topic, mode: evalResult.mode, player: playerName,
    percentage: evalResult.percentage, grade: evalResult.grade,
    totalScore: evalResult.totalScore, maxTotal: evalResult.maxTotal,
    dimensions: evalResult.dimensions, strengths: evalResult.strengths,
    improvements: evalResult.improvements, corrections: evalResult.corrections || [],
    summary: evalResult.summary, nextFocus: evalResult.nextFocus, createdAt: Date.now(),
  };
  const all = loadEvaluations();
  saveJSON(KEYS.evaluations, [stored, ...all].slice(0, 500));
  return stored;
}
function loadTargets() { return loadJSON(KEYS.targets, []); }
function getTarget(topic, mode) { return loadTargets().find(t => t.topic === topic && t.mode === mode) || null; }
function setTarget(topic, mode, targetPercentage) {
  const now = Date.now(); const existing = getTarget(topic, mode);
  const target = existing ? { ...existing, targetPercentage, updatedAt: now } : { topic, mode, targetPercentage, createdAt: now, updatedAt: now };
  const others = loadTargets().filter(t => !(t.topic === topic && t.mode === mode));
  saveJSON(KEYS.targets, [target, ...others]);
}
function deleteTarget(topic, mode) { saveJSON(KEYS.targets, loadTargets().filter(t => !(t.topic === topic && t.mode === mode))); }

function loadPlayers() {
  const players = loadJSON(KEYS.players, []);
  if (!players.find(p => p.id === 'me')) {
    const def = { id: 'me', name: 'Saya', createdAt: Date.now() };
    saveJSON(KEYS.players, [def, ...players]);
    return [def, ...players];
  }
  return players;
}
function addPlayer(name) {
  const player = { id: uid(), name: name.trim(), createdAt: Date.now() };
  saveJSON(KEYS.players, [...loadPlayers(), player]);
  return player;
}
function deletePlayer(id) {
  if (id === 'me') return;
  saveJSON(KEYS.players, loadPlayers().filter(p => p.id !== id));
  if (getCurrentPlayerId() === id) setCurrentPlayerId('me');
}
function getCurrentPlayerId() { return localStorage.getItem(KEYS.currentPlayer) || 'me'; }
function setCurrentPlayerId(id) { if (loadPlayers().find(p => p.id === id)) localStorage.setItem(KEYS.currentPlayer, id); }
function getCurrentPlayer() { const id = getCurrentPlayerId(); return loadPlayers().find(p => p.id === id) || loadPlayers()[0]; }

function getPreviousEvaluation(topic, mode, playerName, excludeId) {
  return loadEvaluations()
    .filter(e => e.topic === topic && e.mode === mode && e.player === playerName && e.id !== excludeId)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
}

function getLeaderboard() {
  const evals = loadEvaluations();
  const byPlayer = new Map();
  for (const e of evals) {
    const arr = byPlayer.get(e.player) || []; arr.push(e); byPlayer.set(e.player, arr);
  }
  const entries = [];
  for (const [player, evalList] of byPlayer) {
    const pcts = evalList.map(e => e.percentage);
    const avg = pcts.reduce((s, p) => s + p, 0) / (pcts.length || 1);
    const best = Math.max(...pcts, 0);
    const topics = new Set(evalList.map(e => `${e.topic}|${e.mode}`));
    entries.push({
      player, totalSessions: evalList.length,
      averagePercentage: Math.round(avg * 10) / 10, bestPercentage: best,
      topicsCovered: topics.size, lastPlayedAt: evalList.reduce((m, e) => Math.max(m, e.createdAt), 0) || null,
    });
  }
  entries.sort((a, b) => b.bestPercentage - a.bestPercentage || b.averagePercentage - a.averagePercentage);
  return entries;
}

function getTrendData(topicFilter, playerFilter) {
  const evals = loadEvaluations();
  const filtered = evals.filter(e =>
    (!topicFilter || topicFilter === 'all' || e.topic === topicFilter) &&
    (!playerFilter || playerFilter === 'all' || e.player === playerFilter)
  );
  const byWeek = new Map();
  for (const e of filtered) {
    const d = new Date(e.createdAt);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0);
    const ws = d.getTime();
    const arr = byWeek.get(ws) || []; arr.push(e); byWeek.set(ws, arr);
  }
  const points = [];
  for (const [ws, evalList] of byWeek) {
    const pcts = evalList.map(e => e.percentage);
    const avg = pcts.reduce((s, p) => s + p, 0) / (pcts.length || 1);
    points.push({
      weekStart: ws,
      weekLabel: new Date(ws).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
      percentage: Math.round(avg * 10) / 10, count: evalList.length,
    });
  }
  points.sort((a, b) => a.weekStart - b.weekStart);
  return points;
}

// ============================================================
// AI Provider — multi-backend with API key support
// ============================================================
// Pollinations.ai sekarang butuh Turnstile token (anti-bot) yang tidak
// bisa dipenuhi dari browser. Jadi kita pakai OpenRouter (gratis, CORS-enabled)
// atau Google AI Studio (Gemini Flash free).
//
// User perlu set API key di Settings (localStorage, tidak dikirim ke server mana pun).
// Dapatkan free API key di:
//   - OpenRouter: https://openrouter.ai/keys (gratis, $1 credit free)
//   - Google AI Studio: https://aistudio.google.com/apikey (gratis, generous quota)
// ============================================================

const AI_PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyUrl: 'https://openrouter.ai/keys',
    // Map Pollinations model names to OpenRouter free models
    modelMap: {
      'openai': 'meta-llama/llama-3.2-3b-instruct:free',
      'openai-large': 'meta-llama/llama-3.2-3b-instruct:free',
      'openai-fast': 'meta-llama/llama-3.2-3b-instruct:free',
      'openai-reasoning': 'meta-llama/llama-3.2-3b-instruct:free',
      'mistral': 'mistralai/mistral-7b-instruct:free',
      'llama': 'meta-llama/llama-3.2-3b-instruct:free',
      'deepseek': 'deepseek/deepseek-r1:free',
      'deepseek-reasoner': 'deepseek/deepseek-r1:free',
      'qwen-coder': 'qwen/qwen-2.5-coder-32b-instruct:free',
      'gemini': 'google/gemini-flash-1.5:free',
      'searchgpt': 'meta-llama/llama-3.2-3b-instruct:free',
      'unity': 'meta-llama/llama-3.2-3b-instruct:free',
      'bidi': 'meta-llama/llama-3.2-3b-instruct:free',
    },
  },
  google: {
    name: 'Google AI Studio (Gemini)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    keyUrl: 'https://aistudio.google.com/apikey',
    modelMap: null, // Google uses single model
  },
};

function getAIConfig() {
  const provider = localStorage.getItem('feynman-ai-provider') || 'openrouter';
  const apiKey = localStorage.getItem('feynman-ai-apikey') || '';
  return { provider, apiKey };
}

function setAIConfig(provider, apiKey) {
  localStorage.setItem('feynman-ai-provider', provider);
  localStorage.setItem('feynman-ai-apikey', apiKey);
}

function hasAIKey() {
  const { apiKey } = getAIConfig();
  return !!apiKey && apiKey.length > 10;
}

async function callAI(messages, model, temperature) {
  const { provider, apiKey } = getAIConfig();
  if (!apiKey) {
    return {
      ok: false,
      error: 'Belum ada API key. Klik tombol ⚙️ Settings di home untuk set API key gratis (OpenRouter atau Google AI Studio).'
    };
  }
  if (provider === 'google') return callGoogleAI(messages, apiKey, temperature);
  return callOpenRouter(messages, model, apiKey, temperature);
}

async function callOpenRouter(messages, model, apiKey, temperature) {
  const provider = AI_PROVIDERS.openrouter;
  const mappedModel = provider.modelMap[model] || 'meta-llama/llama-3.2-3b-instruct:free';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Feynman Router',
      },
      body: JSON.stringify({
        model: mappedModel,
        messages: messages,
        temperature: temperature ?? 0.6,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `HTTP ${res.status}`;
      try { const e = JSON.parse(errText); errMsg = e.error?.message || errMsg; } catch {}
      if (res.status === 401) errMsg = 'API key tidak valid. Cek di Settings.';
      if (res.status === 429) errMsg = 'Rate limit tercapai. Tunggu 1 menit lalu coba lagi.';
      return { ok: false, error: `OpenRouter: ${errMsg}` };
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    if (!text || !text.trim()) return { ok: false, error: 'Empty response dari OpenRouter' };
    return { ok: true, text: String(text).trim() };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'OpenRouter network error';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('aborted')) {
      return { ok: false, error: 'Gagal terhubung ke OpenRouter. Cek: (1) koneksi internet, (2) API key valid, (3) disable ad blocker, (4) coba lagi.' };
    }
    return { ok: false, error: msg };
  }
}

async function callGoogleAI(messages, apiKey, temperature) {
  const provider = AI_PROVIDERS.google;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  // Convert OpenAI-style messages to Google format
  const systemMsg = messages.find(m => m.role === 'system');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    contents: contents,
    generationConfig: { temperature: temperature ?? 0.6 },
  };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  try {
    const url = `${provider.url}?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `HTTP ${res.status}`;
      try { const e = JSON.parse(errText); errMsg = e.error?.message || errMsg; } catch {}
      if (res.status === 400 && errMsg.includes('API key')) errMsg = 'API key tidak valid. Cek di Settings.';
      if (res.status === 403) errMsg = 'API key tidak memiliki akses. Pastikan Gemini API diaktifkan di Google AI Studio.';
      if (res.status === 429) errMsg = 'Rate limit tercapai. Tunggu 1 menit lalu coba lagi.';
      return { ok: false, error: `Google AI: ${errMsg}` };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text || !text.trim()) return { ok: false, error: 'Empty response dari Google AI' };
    return { ok: true, text: String(text).trim() };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'Google AI network error';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('aborted')) {
      return { ok: false, error: 'Gagal terhubung ke Google AI. Cek: (1) koneksi internet, (2) API key valid di Settings, (3) disable ad blocker, (4) coba lagi.' };
    }
    return { ok: false, error: msg };
  }
}

// Legacy alias for backward compat
async function callPollinations(messages, model, temperature) {
  return callAI(messages, model, temperature);
}

// ============================================================
// ASR (Audio Speech Recognition) via Gemini
// ============================================================
// Rekam audio via MediaRecorder → base64 → kirim ke Gemini
// Support audio panjang (sampai 30 menit) via chunking:
//   - Audio dipecah jadi segmen 4 menit (overlap 2 detik)
//   - ASR per segmen, lalu gabungkan
//   - Pakai Gemini 2.0 Flash (lebih akurat) dengan fallback ke 1.5 Flash
// ============================================================

function getGeminiModel() {
  // User bisa pilih model di settings, default 2.5-flash (paling baru & stabil untuk free tier)
  return localStorage.getItem('feynman-gemini-model') || 'gemini-2.5-flash';
}

async function transcribeAudioWithGemini(audioBase64, mimeType, apiKey, model) {
  const useModel = model || getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: 'Transkripsi audio berikut ke teks Bahasa Indonesia dengan SEMPURNA. Pertahankan kata-kata persis seperti yang diucapkan, tambahkan tanda baca yang sesuai (titik, koma, tanda tanya, seru). Jangan beri penjelasan, jangan beri awalan seperti "Transkrip:". Berikan HANYA teks transkrip.' },
        { inlineData: { mimeType: mimeType || 'audio/wav', data: audioBase64 } }
      ]
    }],
    generationConfig: { temperature: 0.1, topP: 0.95 },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `HTTP ${res.status}`;
      try { const e = JSON.parse(errText); errMsg = e.error?.message || errMsg; } catch {}
      if (res.status === 400 && errMsg.includes('API key')) errMsg = 'API key tidak valid. Cek di Settings.';
      if (res.status === 403) errMsg = 'API key tidak memiliki akses ke Gemini. Aktifkan di Google AI Studio.';
      if (res.status === 429) errMsg = 'Rate limit. Tunggu 1 menit.';
      // Fallback chain jika model utama gagal (model not found / 404)
      if (res.status === 404 || (res.status === 400 && !errMsg.includes('API key'))) {
        const fallbacks = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite'];
        const next = fallbacks.find(m => m !== useModel);
        if (next) {
          console.warn(`[ASR] Fallback dari ${useModel} ke ${next}`);
          return transcribeAudioWithGemini(audioBase64, mimeType, apiKey, next);
        }
      }
      return { ok: false, error: `Gemini ASR: ${errMsg}` };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text || !text.trim()) return { ok: false, error: 'Empty response dari Gemini ASR' };
    return { ok: true, text: String(text).trim() };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'Gemini ASR network error';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('aborted')) {
      return { ok: false, error: 'Gagal terhubung ke Gemini. Cek: (1) koneksi internet, (2) API key valid, (3) disable ad blocker.' };
    }
    return { ok: false, error: msg };
  }
}

// Transcribe long audio via chunking (4 min per chunk, 2s overlap)
async function transcribeLongAudioWithGemini(audioBuffer, apiKey, onProgress) {
  const sampleRate = 16000;
  const chunkDurationSec = 240; // 4 minutes per chunk (9.2MB, safe for inline)
  const overlapSec = 2; // 2 seconds overlap to avoid word cutoff
  const totalDuration = audioBuffer.duration;
  const numChunks = Math.ceil(totalDuration / chunkDurationSec);

  if (numChunks <= 1) {
    // Short audio — single call
    const wavBlob = audioBufferToWav(audioBuffer);
    const base64 = await blobToBase64(wavBlob);
    if (onProgress) onProgress(1, 1);
    return transcribeAudioWithGemini(base64, 'audio/wav', apiKey);
  }

  const results = [];
  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDurationSec;
    const endTime = Math.min(startTime + chunkDurationSec + overlapSec, totalDuration);
    const chunkDuration = endTime - startTime;

    if (onProgress) onProgress(i + 1, numChunks);

    // Extract chunk
    const chunkBuffer = extractAudioChunk(audioBuffer, startTime, endTime, sampleRate);
    const wavBlob = audioBufferToWav(chunkBuffer);
    const base64 = await blobToBase64(wavBlob);

    // ASR with retry
    let result = null;
    for (let retry = 0; retry < 2; retry++) {
      result = await transcribeAudioWithGemini(base64, 'audio/wav', apiKey);
      if (result.ok) break;
      await new Promise(r => setTimeout(r, 1500));
    }

    if (result.ok) {
      results.push(result.text);
    } else {
      console.warn(`[ASR] Chunk ${i + 1} failed:`, result.error);
      results.push(`[bagian ${i + 1} gagal transkripsi: ${result.error}]`);
    }
  }

  return { ok: true, text: results.join(' ').trim() };
}

function extractAudioChunk(audioBuffer, startTimeSec, endTimeSec, targetSampleRate) {
  const startSample = Math.floor(startTimeSec * audioBuffer.sampleRate);
  const endSample = Math.floor(endTimeSec * audioBuffer.sampleRate);
  const numSamples = endSample - startSample;
  const numChannels = 1; // mono

  const offlineCtx = new OfflineAudioContext(numChannels, numSamples * targetSampleRate / audioBuffer.sampleRate, targetSampleRate);
  const source = offlineCtx.createBufferSource();

  // Extract segment from original buffer
  const segmentBuffer = offlineCtx.createBuffer(numChannels, numSamples, audioBuffer.sampleRate);
  for (let ch = 0; ch < Math.min(audioBuffer.numberOfChannels, numChannels); ch++) {
    const originalData = audioBuffer.getChannelData(ch);
    const segmentData = segmentBuffer.getChannelData(ch);
    for (let i = 0; i < numSamples; i++) {
      segmentData[i] = originalData[startSample + i];
    }
  }

  source.buffer = segmentBuffer;
  source.connect(offlineCtx.destination);
  source.start();

  return offlineCtx.startRendering();
}

// ============================================================
// VLM (Video Frame Analysis) via Gemini
// ============================================================
// Ekstrak frame dari video pakai <video> + canvas (di browser)
// Lalu kirim frame ke Gemini Vision untuk deskripsi visual
// Audio dari video juga di-extract dan dikirim untuk ASR
// ============================================================

async function extractVideoFrames(videoBlob, onProgress) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(video.src);
      video.remove();
    };

    video.addEventListener('loadedmetadata', async () => {
      const duration = Math.min(video.duration || 5, 1800); // cap 30 min

      // Adaptive frame count:
      // < 2 min: 4 frames
      // 2-5 min: 1 frame per 30s (4-10 frames)
      // 5-15 min: 1 frame per 60s (5-15 frames)
      // 15-30 min: 1 frame per 90s (10-20 frames)
      // Max 30 frames (Gemini limit)
      let numFrames;
      let intervalSec;
      if (duration < 120) {
        numFrames = 4;
        intervalSec = duration / numFrames;
      } else if (duration < 300) {
        intervalSec = 30;
        numFrames = Math.floor(duration / intervalSec);
      } else if (duration < 900) {
        intervalSec = 60;
        numFrames = Math.floor(duration / intervalSec);
      } else {
        intervalSec = 90;
        numFrames = Math.floor(duration / intervalSec);
      }
      numFrames = Math.min(numFrames, 30); // Gemini max ~30 images per request

      const frames = [];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      // Higher resolution for better VLM accuracy (640px)
      const targetWidth = 640;
      const targetHeight = Math.round((video.videoHeight / video.videoWidth) * targetWidth) || 480;
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      for (let i = 0; i < numFrames; i++) {
        const t = Math.min(i * intervalSec + intervalSec / 2, duration - 0.5);
        try {
          video.currentTime = t;
          await new Promise((r) => {
            const onSeeked = () => { video.removeEventListener('seeked', onSeeked); r(); };
            video.addEventListener('seeked', onSeeked);
            setTimeout(() => { video.removeEventListener('seeked', onSeeked); r(); }, 3000);
          });
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          // Add timestamp overlay for VLM context
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(5, 5, 80, 22);
          ctx.fillStyle = '#fff';
          ctx.font = '12px sans-serif';
          const mm = Math.floor(t / 60);
          const ss = Math.floor(t % 60);
          ctx.fillText(`${mm}:${ss.toString().padStart(2, '0')}`, 12, 21);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          frames.push({ base64: dataUrl.split(',')[1], timestamp: t });
          if (onProgress) onProgress(i + 1, numFrames);
        } catch (e) {
          // skip frame yang gagal
        }
      }
      cleanup();
      resolve(frames);
    });

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('Gagal load video untuk ekstrak frame'));
    });

    // Timeout 30s kalau video tidak bisa di-load (longer for big videos)
    setTimeout(() => {
      if (video.readyState === 0) {
        cleanup();
        reject(new Error('Video load timeout'));
      }
    }, 30000);
  });
}

async function extractAudioFromVideo(videoBlob) {
  // Ekstrak audio dari video pakai Web Audio API
  // Hasil: base64 wav
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;

    video.addEventListener('loadedmetadata', async () => {
      try {
        // Pakai AudioContext untuk decode + re-encode ke WAV
        const arrayBuffer = await videoBlob.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Convert to WAV (16kHz mono) untuk hemat ukuran
        const sampleRate = 16000;
        const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * sampleRate, sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start();

        const renderedBuffer = await offlineCtx.startRendering();
        const wavBlob = audioBufferToWav(renderedBuffer);
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          const comma = result.indexOf(',');
          URL.revokeObjectURL(video.src);
          resolve({ base64: comma >= 0 ? result.slice(comma + 1) : result, mimeType: 'audio/wav' });
        };
        reader.onerror = reject;
        reader.readAsDataURL(wavBlob);
      } catch (err) {
        URL.revokeObjectURL(video.src);
        reject(err);
      }
    });

    video.addEventListener('error', () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Gagal load video untuk ekstrak audio'));
    });
  });
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const numSamples = buffer.length;
  const blockAlign = numChannels * bitDepth / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Audio data (mono only — pakai channel 0)
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

async function describeVideoFramesWithGemini(frames, topic, apiKey) {
  const useModel = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${apiKey}`;

  // Build detailed prompt with timestamps
  const timestampList = frames.map((f, i) => `Frame ${i + 1}: menit ${Math.floor(f.timestamp / 60)}:${Math.floor(f.timestamp % 60).toString().padStart(2, '0')}`).join('\n');

  const parts = [
    { text: `Berikut adalah ${frames.length} frame dari video yang diambil oleh seorang pembelajar${topic ? ` tentang topik: "${topic}"` : ''}.

Timestamp setiap frame:
${timestampList}

Jelaskan secara DETAIL apa yang diperlihatkan di setiap frame. Untuk setiap frame, sebutkan:
1. Apa yang tertulis di papan tulis / layar (jika ada, kutip persis)
2. Diagram / gambar / visual yang ditampilkan
3. Gestur atau ekspresi orang di frame
4. Objek yang ditunjuk atau ditonjolkan

Gabungkan menjadi narasi kronologis yang mengalir. Maksimal 400 kata. Bahasa Indonesia.` }
  ];
  for (const frame of frames) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: frame.base64 } });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.3 },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `HTTP ${res.status}`;
      try { const e = JSON.parse(errText); errMsg = e.error?.message || errMsg; } catch {}
      if (res.status === 400 && errMsg.includes('API key')) errMsg = 'API key tidak valid. Cek di Settings.';
      if (res.status === 403) errMsg = 'API key tidak memiliki akses ke Gemini. Aktifkan di Google AI Studio.';
      if (res.status === 429) errMsg = 'Rate limit. Tunggu 1 menit.';
      // Fallback ke model lain yang masih aktif jika model utama 404/400
      if (useModel === 'gemini-2.0-flash' && (res.status === 404 || (res.status === 400 && !errMsg.includes('API key')))) {
        console.warn('[Image VLM] Fallback to gemini-2.0-flash-lite');
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
        const fallbackController = new AbortController();
        const fallbackTimeout = setTimeout(() => fallbackController.abort(), 60000);
        try {
          const fallbackRes = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: fallbackController.signal,
          });
          clearTimeout(fallbackTimeout);
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            const fallbackText = fallbackData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (fallbackText.trim()) return { ok: true, text: String(fallbackText).trim() };
          }
        } catch (e) {
          clearTimeout(fallbackTimeout);
        }
      }
      return { ok: false, error: `Gemini Image: ${errMsg}` };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text || !text.trim()) return { ok: false, error: 'Empty response dari Gemini Image' };
    return { ok: true, text: String(text).trim() };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'Gemini Image network error';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('aborted')) {
      return { ok: false, error: 'Gagal terhubung ke Gemini. Cek: (1) koneksi internet, (2) API key valid, (3) disable ad blocker.' };
    }
    return { ok: false, error: msg };
  }
}

// ============================================================
// Image Analysis via Gemini Vision
// ============================================================
// User upload gambar (diagram, rumus, screenshot, foto konsep)
// → Gemini Vision analisis konsep di gambar secara mendalam
// → Deskripsi disertakan ke prompt AI persona untuk konteks
// ============================================================

async function analyzeImageWithGemini(imageBase64, mimeType, topic, apiKey) {
  const useModel = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${apiKey}`;

  // Resize image di browser dulu kalau terlalu besar (hemat bandwidth)
  // Gemini limit: 20MB inline image, tapi kita cap ke 1280px lebar
  const { base64: resizedBase64, mimeType: resizedMime } = await resizeImageIfNeeded(imageBase64, mimeType, 1280);

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: `Analisis gambar berikut secara MENDALAM${topic ? ` dalam konteks topik: "${topic}"` : ''}.

Berikan analisis terstruktur:

1. **Jenis konten**: Apa jenis gambar ini? (diagram, rumus matematika, screenshot kode, foto objek, papan tulis, infografis, dll)

2. **Konsep utama**: Konsep apa yang sedang dijelaskan atau ditunjukkan di gambar? Jelaskan inti konsepnya.

3. **Detail visual** (kutip persis jika ada teks):
   - Teks/tulisan yang terlihat (rumus, label, judul)
   - Diagram/alur yang ditampilkan
   - Angka/data yang tertera
   - Simbol/notasi yang digunakan

4. **Hubungan komponen**: Bagaimana elemen-elemen di gambar saling berhubungan? Jelaskan alur atau struktur.

5. **Implikasi konsep**: Apa makna atau implikasi dari konsep yang ditunjukkan? Mengapa ini penting?

6. **Pertanyaan potensial**: 2-3 pertanyaan kunci yang biasanya muncul terkait konsep ini (untuk membantu evaluasi pemahaman).

Jawab dalam Bahasa Indonesia, maksimal 500 kata. Jika gambar tidak jelas atau tidak relevan, sebutkan.` },
        { inlineData: { mimeType: resizedMime, data: resizedBase64 } }
      ]
    }],
    generationConfig: { temperature: 0.3, topP: 0.95 },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `HTTP ${res.status}`;
      try { const e = JSON.parse(errText); errMsg = e.error?.message || errMsg; } catch {}
      // Fallback ke model lain yang masih aktif
      if (useModel === 'gemini-2.0-flash' && (res.status === 404 || (res.status === 400 && !errMsg.includes('API key')))) {
        console.warn('[VLM] Fallback to gemini-2.0-flash-lite');
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
        const fallbackController = new AbortController();
        const fallbackTimeout = setTimeout(() => fallbackController.abort(), 60000);
        try {
          const fallbackRes = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: fallbackController.signal,
          });
          clearTimeout(fallbackTimeout);
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            const fallbackText = fallbackData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (fallbackText.trim()) return { ok: true, text: String(fallbackText).trim() };
          }
        } catch (e) {
          clearTimeout(fallbackTimeout);
        }
      }
      return { ok: false, error: `Gemini VLM: ${errMsg}` };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text || !text.trim()) return { ok: false, error: 'Empty response dari Gemini VLM' };
    return { ok: true, text: String(text).trim() };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : 'Gemini VLM network error';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('aborted')) {
      return { ok: false, error: 'Gagal terhubung ke Gemini. Cek: (1) koneksi internet, (2) API key valid, (3) disable ad blocker.' };
    }
    return { ok: false, error: msg };
  }
}

// Resize image di browser pakai canvas kalau terlalu besar
async function resizeImageIfNeeded(imageBase64, mimeType, maxWidth) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        // Kalau sudah kecil enough, return as-is
        if (img.width <= maxWidth) {
          URL.revokeObjectURL(img.src);
          resolve({ base64: imageBase64, mimeType });
          return;
        }
        // Resize pakai canvas
        const scale = maxWidth / img.width;
        const targetWidth = maxWidth;
        const targetHeight = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        // JPEG quality 0.8 — good balance
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(img.src);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve({ base64: imageBase64, mimeType }); // fallback to original
      };
      // Convert base64 to blob URL for Image loading
      const byteChars = atob(imageBase64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      img.src = URL.createObjectURL(blob);
    } catch (e) {
      resolve({ base64: imageBase64, mimeType });
    }
  });
}

// Convert File to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      const comma = result.indexOf(',');
      resolve({ base64: comma >= 0 ? result.slice(comma + 1) : result, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


// ============================================================

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function getNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

function showNotification(title, body, tag) {
  if (!notificationsSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title, {
      body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: tag || 'feynman',
      requireInteraction: false,
    });
    // Auto-close after 8 seconds
    setTimeout(() => { try { n.close(); } catch {} }, 8000);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Smart Router
// ============================================================
const SPECIALTY_KEYWORDS = {
  coding: ['kode', 'coding', 'program', 'function', 'api', 'javascript', 'python', 'typescript', 'react', 'nextjs', 'database', 'sql', 'algoritma', 'algorithm'],
  sains: ['fisika', 'physics', 'biologi', 'kimia', 'chemistry', 'biology', 'sains', 'science', 'quantum', 'atom', 'sel', 'molekul'],
  matematika: ['matematika', 'math', 'aljabar', 'kalkulus', 'geometri', 'statistik', 'probabilitas', 'bukti', 'proof', 'teorema'],
  filsafat: ['filsafat', 'philosophy', 'etika', 'etik', 'moral', 'eksistensi', 'metafisika', 'epistemologi'],
  bahasa: ['bahasa', 'language', 'linguistik', 'grammar', 'tata bahasa', 'sastra', 'literature'],
  sejarah: ['sejarah', 'history', 'perang', 'war', 'revolusi', 'kerajaan', 'civilization', 'peradaban'],
  riset: ['riset', 'research', 'paper', 'jurnal', 'studi', 'data', 'eksperimen', 'experiment'],
  berita: ['berita', 'news', 'terkini', 'update', 'tren', 'trend', 'viral'],
  kreatif: ['kreatif', 'creative', 'seni', 'art', 'musik', 'music', 'desain', 'design', 'narasi', 'cerita'],
  komunikasi: ['komunikasi', 'communication', 'presentasi', 'negosiasi', 'public speaking'],
  geometri: ['geometri', 'ruang', 'visual', 'spasial', 'bentuk', 'dimensi'],
  pemula: ['pemula', 'dasar', 'basic', 'pengenalan', 'intro', 'awal'],
};

function detectSpecialties(topic, userMessage) {
  const text = `${topic} ${userMessage}`.toLowerCase();
  const matched = new Set();
  for (const [sp, kws] of Object.entries(SPECIALTY_KEYWORDS)) {
    if (kws.some(kw => text.includes(kw))) matched.add(sp);
  }
  return Array.from(matched);
}

function scorePersona(persona, mode, specialties, previousPersonaId) {
  let score = 0;
  if (mode === 'hybrid') {
    if (persona.role === 'hybrid') score += 110;
    else if (persona.role === 'coach' || persona.role === 'student') score += 80;
  } else if (persona.role === mode) score += 100;
  else if (persona.role === 'hybrid') score += 50;
  else score -= 1000;

  for (const s of specialties) {
    if (persona.specialties.includes(s)) score += 30;
    else if (persona.specialties.some(p => p.includes(s) || s.includes(p))) score += 15;
  }
  if (persona.specialties.includes('umum')) score += 5;
  if (persona.specialties.includes('general')) score += 5;
  if (persona.id === previousPersonaId) score -= 40;
  score += Math.random() * 10;
  return score;
}

async function smartRouter(mode, topic, userMessage, history, personaId, previousPersonaId) {
  let candidates;
  if (personaId) {
    const pinned = getPersonaById(personaId);
    candidates = pinned ? [pinned] : listPersonasByRole(mode);
  } else {
    candidates = listPersonasByRole(mode);
  }

  const specialties = detectSpecialties(topic, userMessage);
  const scored = candidates
    .map(p => ({ persona: p, score: scorePersona(p, mode, specialties, previousPersonaId) }))
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 3);
  const attempts = [];

  for (const { persona } of top) {
    const messages = [
      { role: 'system', content: persona.systemPrompt },
      ...history.slice(-8).map(m => ({ role: m.role, content: m.text })),
      { role: 'user', content: userMessage },
    ];
    const result = await callPollinations(messages, persona.model, persona.temperature);
    attempts.push({ personaId: persona.id, ok: result.ok, error: result.error });
    if (result.ok && result.text) {
      return { ok: true, text: result.text, persona, attempts };
    }
  }

  return {
    ok: false, text: '', persona: null, attempts,
    error: 'Semua AI gratis sedang sibuk. Coba lagi dalam beberapa detik, atau ganti persona AI.',
  };
}

// ============================================================
// Evaluator (uses Pollinations for JSON response)
// ============================================================
const EVAL_SYSTEM_PROMPT = `Kamu adalah evaluator sertifikasi Feynman yang ketat tapi konstruktif. Tugasmu menilai penjelasan user tentang suatu topik berdasarkan 7 dimensi:

1. simplicity (Kesederhanaan) — bebas jargon tak dijelaskan, bahasa awam
2. clarity (Kejelasan) — ide utama tersampaikan tanpa ambiguitas
3. accuracy (Akurasi) — fakta, definisi, logika benar
4. depth (Kedalaman) — menyentuh prinsip dasar, bukan permukaan
5. structure (Struktur) — ada pembuka-isi-penutup, alur logis
6. analogy (Analogi & Contoh) — diperkuat analogi/kontoh konkret
7. correction (Koreksi & Perbaikan) — sejauh mana user mampu menerima & merespons koreksi AI selama sesi.

PENTING — SISTEM KOREKSI: Identifikasi setiap kesalahan spesifik dalam penjelasan user (fakta salah, logika salah, konsep salah, ada yang tertinggal, terlalu kabur, analogi salah, istilah salah). Untuk setiap kesalahan, berikan KUTIPAN teks user, JENIS kesalahan, PENJELASAN mengapa salah, KOREKSI (apa yang seharusnya user katakan), dan TINGKAT KEPARAHAN.

WAJIB jawab dalam JSON VALID dengan struktur:
{
  "dimensions": [
    {"key": "simplicity", "score": <0-10>, "feedback": "<1-2 kalimat>"},
    {"key": "clarity", "score": <0-10>, "feedback": "<1-2 kalimat>"},
    {"key": "accuracy", "score": <0-10>, "feedback": "<1-2 kalimat>"},
    {"key": "depth", "score": <0-10>, "feedback": "<1-2 kalimat>"},
    {"key": "structure", "score": <0-10>, "feedback": "<1-2 kalimat>"},
    {"key": "analogy", "score": <0-10>, "feedback": "<1-2 kalimat>"},
    {"key": "correction", "score": <0-10>, "feedback": "<1-2 kalimat tentang kemampuan koreksi user>"}
  ],
  "strengths": ["<kekuatan 1>", "<kekuatan 2>", "<kekuatan 3>"],
  "improvements": ["<perbaikan 1>", "<perbaikan 2>", "<perbaikan 3>"],
  "corrections": [
    {"quote": "<kutipan>", "errorType": "factual|logical|conceptual|omission|vague|analogy_wrong|terminology|other", "explanation": "<mengapa salah>", "correction": "<koreksi>", "severity": "low|medium|high"}
  ],
  "summary": "<paragraf 3-4 kalimat>",
  "nextFocus": "<saran fokus sesi berikutnya>"
}

ATURAN:
- Skor 0-10 (boleh desimal).
- Corrections: identifikasi SEMUA kesalahan (min 1, max 8). Kalau tidak ada, kirim array kosong [].
- Bahasa Indonesia.
- JANGAN tambahkan teks di luar JSON.`;

function pctToGrade(pct) {
  if (pct >= 95) return 'A+';
  if (pct >= 85) return 'A';
  if (pct >= 75) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}
function gradeToLabel(g) {
  const m = { 'A+': 'Luar biasa — pemahaman Feynman-level', 'A': 'Sangat baik — hampir sempurna', 'B': 'Baik — beberapa celah kecil', 'C': 'Cukup — banyak celah yang perlu diperbaiki', 'D': 'Kurang — pemahaman masih dangkal', 'F': 'Belum memadai — perlu pelajari ulang' };
  return m[g] || '';
}

function extractJson(text) {
  try { JSON.parse(text); return text; } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = text.indexOf('{'); const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return null;
}

async function evaluateExplanation(mode, topic, transcript, aiQuestions) {
  const startedAt = Date.now();
  const modeLabel = mode === 'coach' ? 'Coach — nilai dari sudut pandang mentor' : mode === 'student' ? 'Murid — nilai dari sudut pandang murid' : 'Hybrid — nilai dari kedua sudut pandang';
  const aiBlock = aiQuestions.length > 0 ? aiQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n') : '(tidak ada pertanyaan AI)';

  const userPrompt = `MODE: ${modeLabel}

TOPIK: ${topic}

PERTANYAAN YANG DIAJUKAN AI SELAMA SESI:
${aiBlock}

PENJELASAN USER (transkrip lengkap):
"""
${transcript}
"""

Nilai penjelasan user. Identifikasi SEMUA kesalahan spesifik dan berikan koreksinya. Jawab HANYA dengan JSON.`;

  const result = await callPollinations(
    [{ role: 'system', content: EVAL_SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
    'openai-fast', 0.3
  );

  if (!result.ok) {
    return { ok: false, error: `Gagal menilai: ${result.error}. Coba lagi sebentar.`, durationMs: Date.now() - startedAt };
  }

  const jsonStr = extractJson(result.text);
  if (!jsonStr) {
    return { ok: false, error: 'AI tidak mengembalikan JSON valid. Coba lagi.', durationMs: Date.now() - startedAt };
  }

  let parsed;
  try { parsed = JSON.parse(jsonStr); }
  catch { return { ok: false, error: 'Format JSON dari AI tidak valid. Coba lagi.', durationMs: Date.now() - startedAt }; }

  const dimensions = [
    { key: 'simplicity', label: 'Kesederhanaan', icon: '🌱', maxScore: 10 },
    { key: 'clarity', label: 'Kejelasan', icon: '💧', maxScore: 10 },
    { key: 'accuracy', label: 'Akurasi', icon: '🎯', maxScore: 10 },
    { key: 'depth', label: 'Kedalaman', icon: '🌊', maxScore: 10 },
    { key: 'structure', label: 'Struktur', icon: '🏗️', maxScore: 10 },
    { key: 'analogy', label: 'Analogi & Contoh', icon: '🔗', maxScore: 10 },
    { key: 'correction', label: 'Koreksi & Perbaikan', icon: '🛠️', maxScore: 10 },
  ].map(def => {
    const raw = (parsed.dimensions || []).find(d => d.key === def.key) || {};
    const score = Math.max(0, Math.min(def.maxScore, Number(raw.score || 0)));
    return { ...def, score, feedback: String(raw.feedback || '').slice(0, 500) };
  });

  const totalScore = dimensions.reduce((s, d) => s + d.score, 0);
  const maxTotal = 70;
  const percentage = Math.round((totalScore / maxTotal) * 100);
  const grade = pctToGrade(percentage);
  const gradeLabel = gradeToLabel(grade);

  const validErrorTypes = ['factual', 'logical', 'conceptual', 'omission', 'vague', 'analogy_wrong', 'terminology', 'other'];
  const corrections = (parsed.corrections || []).slice(0, 10).map(raw => ({
    quote: String(raw.quote || '').slice(0, 500),
    errorType: validErrorTypes.includes(raw.errorType) ? raw.errorType : 'other',
    explanation: String(raw.explanation || '').slice(0, 600),
    correction: String(raw.correction || '').slice(0, 600),
    severity: ['low', 'medium', 'high'].includes(raw.severity) ? raw.severity : 'medium',
  })).filter(c => c.quote && c.explanation && c.correction);

  return {
    ok: true, mode, topic, dimensions, totalScore, maxTotal, percentage,
    grade, gradeLabel,
    strengths: (parsed.strengths || []).slice(0, 3).map(s => String(s).slice(0, 300)),
    improvements: (parsed.improvements || []).slice(0, 3).map(s => String(s).slice(0, 300)),
    corrections,
    summary: String(parsed.summary || '').slice(0, 1500),
    nextFocus: String(parsed.nextFocus || '').slice(0, 500),
    durationMs: Date.now() - startedAt,
  };
}

// ============================================================
// Speech Recognition + Synthesis
// ============================================================
let recognition = null;
let processedFinalIndices = new Set();
let lastEmittedFinalText = '';
let speechSynthesisVoices = [];

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'id-ID'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    let finalText = ''; let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) {
        if (processedFinalIndices.has(i)) continue;
        processedFinalIndices.add(i);
        finalText += r[0].transcript;
      } else {
        interimText += r[0].transcript;
      }
    }
    if (finalText) {
      const deduped = dedupeTranscript(finalText).trim();
      if (deduped && deduped !== lastEmittedFinalText) {
        lastEmittedFinalText = deduped;
        const input = $('message-input');
        const prev = input.value;
        const combined = prev ? dedupeTranscript(prev + ' ' + deduped) : deduped;
        input.value = combined;
        updateSendButton();
      }
    }
    $('interim-text').textContent = interimText;
  };
  rec.onerror = (e) => {
    console.warn('[SpeechRecognition] error:', e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      showToast('❌ Mikrofon diblokir. Settings browser → izinkan mikrofon untuk situs ini.', 'error');
    } else if (e.error === 'no-speech') {
      // Silent — speech recognition akan auto-restart
      console.log('[SpeechRecognition] no speech detected, will restart');
    } else if (e.error === 'aborted') {
      // User stopped — ignore
    } else if (e.error === 'network') {
      showToast('⚠️ Mic error network. Coba lagi atau pakai tombol rekam.', 'warning');
    } else {
      showToast(`Mic error: ${e.error || 'unknown'}. Coba pakai tombol rekam.`, 'warning');
    }
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      setMicRecording(false);
    }
  };
  rec.onend = () => {
    // Auto-restart jika user masih mau rekam (Android Chrome sering stop otomatis)
    if (rec.isRecording && rec._shouldRestart) {
      try {
        rec.start();
      } catch (e) {
        console.warn('[SpeechRecognition] restart failed:', e.message);
        setMicRecording(false);
      }
    } else {
      setMicRecording(false);
    }
  };
  return rec;
}

function setMicRecording(on) {
  const btn = $('mic-btn');
  const indicator = $('listening-indicator');
  if (on) {
    btn.classList.add('recording');
    btn.textContent = '⏹';
    indicator.style.display = 'flex';
  } else {
    btn.classList.remove('recording');
    btn.textContent = '🎤';
    indicator.style.display = 'none';
    $('interim-text').textContent = '';
  }
}

function toggleMic() {
  if (!recognition) {
    recognition = initSpeechRecognition();
    if (!recognition) {
      showToast('Browser tidak mendukung Web Speech API. Pakai Chrome/Edge Android.', 'warning');
      return;
    }
  }
  if (recognition.isRecording) {
    // Stop
    recognition._shouldRestart = false;
    recognition.isRecording = false;
    try { recognition.stop(); } catch {}
    setMicRecording(false);
  } else {
    // Start
    processedFinalIndices.clear();
    lastEmittedFinalText = '';
    recognition._shouldRestart = true;
    recognition.isRecording = true;
    try {
      recognition.start();
      setMicRecording(true);
    } catch (e) {
      // Maybe already running — try abort + restart
      try { recognition.abort(); } catch {}
      setTimeout(() => {
        try {
          recognition.start();
          setMicRecording(true);
        } catch (e2) {
          showToast('Gagal mulai mic. Refresh halaman lalu coba lagi.', 'error');
          recognition.isRecording = false;
          recognition._shouldRestart = false;
          setMicRecording(false);
        }
      }, 200);
    }
  }
}

function speakText(text) {
  if (!state.autoSpeak || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'id-ID'; u.rate = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find(v => v.lang === 'id-ID') || voices.find(v => v.lang.startsWith('id'));
  if (match) u.voice = match;
  window.speechSynthesis.speak(u);
}

// ============================================================
// Media Recorder (audio fallback)
// ============================================================
let mediaRecorder = null;
let mediaChunks = [];
let mediaStream = null;
let mediaKind = 'audio';
let mediaStartTime = 0;
let mediaTimer = null;
const MAX_RECORDING_DURATION_SEC = 1800; // 30 minutes

async function startMediaRecorder(kind) {
  if (!window.MediaRecorder) { showToast('MediaRecorder tidak didukung. Pakai Chrome/Edge.', 'error'); return false; }
  try {
    const constraints = kind === 'video'
      ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } }
      : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    mediaKind = kind;
    const mimeCandidates = kind === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m));

    // Better bitrate settings for quality
    const options = { mimeType };
    if (mimeType) {
      if (kind === 'video') {
        options.videoBitsPerSecond = 2_500_000; // 2.5 Mbps for clear video
        options.audioBitsPerSecond = 128_000;   // 128 kbps for clear audio
      } else {
        options.audioBitsPerSecond = 192_000;   // 192 kbps for high quality audio
      }
    }

    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, options) : new MediaRecorder(mediaStream);
    mediaChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) mediaChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(mediaChunks, { type: mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') });
      const elapsed = (Date.now() - mediaStartTime) / 1000;
      stopMediaStream();
      await processRecording(blob, kind, Math.round(elapsed));
    };
    mediaRecorder.start(1000); // collect chunks every 1s (better for long recording)
    mediaStartTime = Date.now();
    mediaTimer = setInterval(() => {
      const sec = Math.round((Date.now() - mediaStartTime) / 1000);
      const m = Math.floor(sec / 60); const s = sec % 60;
      const el = $('recorder-duration');
      if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      // Show warning at 25 min
      if (sec === 1500) {
        showToast('⚠️ Sisa 5 menit lagi sebelum auto-stop di 30 menit', 'warning');
      }
      // Auto-stop at 30 min
      if (sec >= MAX_RECORDING_DURATION_SEC) {
        showToast('⏰ Auto-stop di 30 menit', 'warning');
        stopMediaRecorder();
        setRecorderStage('processing', 'Memproses rekaman 30 menit... (bisa 2-5 menit)');
      }
    }, 500);
    return true;
  } catch (err) {
    showToast(`Gagal akses ${kind === 'video' ? 'kamera' : 'mikrofon'}: ${err.message}`, 'error');
    stopMediaStream();
    return false;
  }
}

function stopMediaRecorder() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch {}
  }
  if (mediaTimer) { clearInterval(mediaTimer); mediaTimer = null; }
}

function stopMediaStream() {
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  mediaRecorder = null; mediaChunks = [];
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => { const result = r.result; const comma = result.indexOf(','); resolve(comma >= 0 ? result.slice(comma + 1) : result); };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function processRecording(blob, kind, durationSec) {
  const { provider, apiKey } = getAIConfig();
  if (!apiKey) {
    setRecorderStage('error', 'Belum ada API key. Klik ⚙️ Settings di home untuk set API key Google AI Studio (gratis) — dibutuhkan untuk transkripsi audio/video via Gemini.');
    return;
  }
  if (provider !== 'google') {
    setRecorderStage('error', 'Transkripsi audio/video hanya support provider Google AI Studio (Gemini). Buka ⚙️ Settings, ganti provider ke "Google AI Studio", set API key dari https://aistudio.google.com/apikey.');
    return;
  }

  const durationMin = Math.round((durationSec || 0) / 60);

  if (kind === 'audio') {
    // Audio ASR via Gemini with chunking for long audio
    setRecorderStage('processing', durationMin > 5
      ? `Mentranskripsi audio ${durationMin} menit via Gemini... (chunking, ~${Math.ceil(durationMin / 4)} segmen, 1-3 menit)`
      : 'Mentranskripsi audio via Gemini... (10-30 detik)');

    try {
      // Decode audio to AudioBuffer for chunking
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      audioContext.close();

      // Use chunking for long audio
      const result = await transcribeLongAudioWithGemini(audioBuffer, apiKey, (chunk, total) => {
        setRecorderStage('processing', `Transkripsi segmen ${chunk}/${total} via Gemini... (~${Math.ceil(total * 30 / 60)} menit total)`);
      });

      if (result.ok) {
        const text = result.text.trim();
        if (text) {
          const input = $('message-input');
          input.value = (input.value ? input.value + ' ' : '') + text;
          updateSendButton();
          setRecorderStage('done', `Transkrip ${durationMin} menit: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
        } else {
          setRecorderStage('error', 'Audio tidak terdeteksi. Coba rekam lagi dengan suara yang lebih jelas.');
        }
      } else {
        setRecorderStage('error', result.error || 'Gagal transkripsi audio.');
      }
    } catch (err) {
      setRecorderStage('error', `Error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  } else if (kind === 'video') {
    // Video VLM + ASR via Gemini
    setRecorderStage('processing', durationMin > 5
      ? `Memproses video ${durationMin} menit... (frame + audio, 2-5 menit)`
      : 'Mengekstrak frame + audio dari video... (15-45 detik)');

    try {
      // Step 1: Extract frames (visual) with adaptive count
      let frames = [];
      let vlmText = '';
      try {
        frames = await extractVideoFrames(blob, (current, total) => {
          setRecorderStage('processing', `Mengekstrak frame visual ${current}/${total}...`);
        });
        if (frames.length > 0) {
          setRecorderStage('processing', `Menganalisis ${frames.length} frame via Gemini VLM...`);
          const vlmResult = await describeVideoFramesWithGemini(frames, state.topic, apiKey);
          if (vlmResult.ok) vlmText = vlmResult.text;
        }
      } catch (e) {
        console.warn('Frame extraction failed:', e);
      }

      // Step 2: Extract audio + ASR with chunking
      let asrText = '';
      try {
        setRecorderStage('processing', 'Mengekstrak audio dari video...');
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioContext.close();

        // Use chunking for long audio
        const asrResult = await transcribeLongAudioWithGemini(audioBuffer, apiKey, (chunk, total) => {
          setRecorderStage('processing', `Transkripsi audio segmen ${chunk}/${total} via Gemini...`);
        });
        if (asrResult.ok) asrText = asrResult.text;
      } catch (e) {
        console.warn('Audio extraction failed:', e);
      }

      // Step 3: Combine
      const parts = [];
      if (asrText) parts.push(`[Yang dikatakan user]: ${asrText}`);
      if (vlmText) parts.push(`[Yang diperlihatkan di video]: ${vlmText}`);
      const transcript = parts.join('\n\n').trim();

      if (transcript) {
        const input = $('message-input');
        input.value = (input.value ? input.value + '\n\n' : '') + transcript;
        updateSendButton();
        const summary = [];
        if (asrText) summary.push('audio ✓');
        if (vlmText) summary.push(`${frames.length} frame ✓`);
        setRecorderStage('done', `Transkripsi ${durationMin} menit selesai! (${summary.join(', ')})`);
      } else {
        setRecorderStage('error', 'Tidak dapat mengekstrak konten dari video. Pastikan ada suara atau visual yang jelas.');
      }
    } catch (err) {
      setRecorderStage('error', `Error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
}

// ============================================================
// View rendering
// ============================================================
function showView(name) {
  state.view = name;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`${name}-view`).classList.add('active');
}

function updateSendButton() {
  const input = $('message-input');
  // Allow send if there's text OR attached image (with analysis done or in progress done)
  const hasContent = input.value.trim() || (state.attachedImage && !state.isAnalyzingImage);
  $('send-btn').disabled = !hasContent || state.isThinking;
}

function setThinking(on) {
  state.isThinking = on;
  updateSendButton();
  const msgs = $('messages');
  let t = $('thinking-indicator-msgs');
  if (on) {
    if (!t) {
      t = document.createElement('div'); t.id = 'thinking-indicator-msgs'; t.className = 'thinking';
      t.innerHTML = `<div class="message-avatar">⏳</div><div class="thinking-dots"><span></span><span></span><span></span></div>`;
      msgs.appendChild(t);
    }
    msgs.scrollTop = msgs.scrollHeight;
  } else {
    if (t) t.remove();
  }
}

function renderMessage(msg) {
  const msgs = $('messages');
  const empty = msgs.querySelector('.empty-state');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `message ${msg.role}${msg.error ? ' error' : ''}`;
  const avatar = msg.role === 'assistant' && msg.persona ? msg.persona.emoji : (msg.role === 'user' ? '🧑' : '🤖');
  const meta = msg.persona ? `<div class="message-meta">${msg.persona.name} • ${msg.persona.provider} • ${msg.durationMs || 0}ms</div>` : '';
  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div>
      <div class="message-bubble">${escapeHtml(msg.text)}</div>
      ${meta}
    </div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;

  // Update header persona
  if (msg.role === 'assistant' && msg.persona) {
    $('persona-avatar').textContent = msg.persona.emoji;
    $('persona-avatar').style.background = msg.persona.providerColor;
    $('persona-name').textContent = msg.persona.name;
  }
}

// ============================================================
// Send message
// ============================================================
async function handleSend() {
  const input = $('message-input');
  const text = input.value.trim();
  if ((!text && !state.attachedImage) || state.isThinking) return;

  // Build user message — include image analysis if attached
  let messageText = text;
  if (state.attachedImage && state.attachedImage.analysis) {
    messageText = text
      ? `${text}\n\n📎 [Analisis gambar "${state.attachedImage.fileName || 'uploaded'}"]:\n${state.attachedImage.analysis}`
      : `📎 [Analisis gambar "${state.attachedImage.fileName || 'uploaded'}"]:\n${state.attachedImage.analysis}\n\n[Jelaskan konsep di gambar ini]`;
  } else if (state.attachedImage && !state.attachedImage.analysis) {
    // Image attached but not yet analyzed
    messageText = text
      ? `${text}\n\n📎 [Gambar terlampir: "${state.attachedImage.fileName || 'uploaded'}" — analisis tidak tersedia, jelaskan berdasarkan teks saja]`
      : `📎 [Gambar terlampir: "${state.attachedImage.fileName || 'uploaded'}" — analisis tidak tersedia]`;
  }

  const userMsg = { id: uid(), role: 'user', text: messageText, createdAt: Date.now(), hasImage: !!state.attachedImage, imageName: state.attachedImage?.fileName };
  state.messages.push(userMsg);
  renderMessage(userMsg);
  input.value = '';
  input.style.height = 'auto';

  // Clear attached image
  clearAttachedImage();
  updateSendButton();

  // Check closing phrase
  const detection = detectClosingPhrase(text);
  if (detection.isClosing) {
    state.closingForMsgId = userMsg.id;
    state.closingDismissed = false;
    showClosingBanner(detection);
  }

  // Persist session
  persistSession();

  setThinking(true);

  const history = state.messages.filter(m => !m.error).slice(-10).map(m => ({ role: m.role, text: m.text }));
  const result = await smartRouter(state.mode, state.topic, messageText, history, state.pinnedPersonaId, state.lastPersonaId);

  setThinking(false);

  if (!result.ok) {
    renderMessage({ id: uid(), role: 'assistant', text: result.error || 'AI tidak tersedia. Coba lagi.', persona: null, error: true, createdAt: Date.now() });
    return;
  }

  const aiMsg = { id: uid(), role: 'assistant', text: result.text, persona: result.persona, durationMs: result.attempts?.[0]?.ok ? undefined : undefined, createdAt: Date.now() };
  state.messages.push(aiMsg);
  renderMessage(aiMsg);
  state.lastPersonaId = result.persona?.id;
  $('last-ai').textContent = `AI: ${result.persona?.id || ''}`;

  // Auto-speak
  if (state.autoSpeak) speakText(result.text);

  // Persist
  persistSession();
}

function showClosingBanner(detection) {
  const banner = $('closing-banner');
  banner.querySelector('.closing-text').textContent = `Sepertinya kamu selesai menjelaskan (terdeteksi: "${detection.matchedPhrase}"). Mau dinilai sekarang?`;
  banner.style.display = 'flex';
}
function hideClosingBanner() { $('closing-banner').style.display = 'none'; }

// ============================================================
// Image attachment — upload + analyze via Gemini
// ============================================================

async function handleImageUpload(file) {
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    showToast('File harus berupa gambar (jpg, png, webp, dll)', 'warning');
    return;
  }

  // Validate file size (max 20MB — Gemini inline limit)
  if (file.size > 20 * 1024 * 1024) {
    showToast('Ukuran gambar maksimal 20MB', 'warning');
    return;
  }

  // Convert to base64
  const { base64, mimeType } = await fileToBase64(file);

  // Set state
  state.attachedImage = {
    base64,
    mimeType,
    fileName: file.name,
    analysis: null, // will be filled by Gemini
  };
  state.isAnalyzingImage = true;

  renderImagePreview();
  updateSendButton();

  // Auto-analyze with Gemini if Google provider
  const { provider, apiKey } = getAIConfig();
  if (provider === 'google' && apiKey) {
    setRecorderStage(null); // close any recorder modal
    renderImagePreview('🔍 Menganalisis gambar via Gemini...');

    const result = await analyzeImageWithGemini(base64, mimeType, state.topic, apiKey);
    state.isAnalyzingImage = false;

    if (result.ok) {
      state.attachedImage.analysis = result.text;
      renderImagePreview('✅ Analisis gambar siap! AI akan memahami konsep di gambar.');
      showToast('Analisis gambar selesai! 🎉', 'success');
    } else {
      state.attachedImage.analysis = null;
      renderImagePreview(`⚠️ Analisis gambar gagal: ${result.error}. Gambar tetap terlampir, AI akan pakai teks kamu saja.`);
      showToast('Analisis gambar gagal, tapi gambar tetap terlampir', 'warning');
    }
  } else {
    state.isAnalyzingImage = false;
    renderImagePreview('ℹ️ Set provider ke Google AI Studio di Settings untuk auto-analisis gambar via Gemini. Gambar tetap bisa dikirim tanpa analisis.');
  }

  updateSendButton();
}

function clearAttachedImage() {
  state.attachedImage = null;
  state.isAnalyzingImage = false;
  renderImagePreview();
}

function renderImagePreview(statusMsg) {
  const preview = $('image-preview');
  if (!state.attachedImage) {
    preview.style.display = 'none';
    preview.innerHTML = '';
    return;
  }

  const img = state.attachedImage;
  const dataUrl = `data:${img.mimeType};base64,${img.base64}`;
  const fileSizeKB = Math.round(img.base64.length * 0.75 / 1024);
  const statusHtml = statusMsg
    ? `<div class="image-preview-status">${escapeHtml(statusMsg)}</div>`
    : (state.isAnalyzingImage
      ? `<div class="image-preview-status">🔍 Menganalisis gambar via Gemini...</div>`
      : (img.analysis
        ? `<div class="image-preview-status">✅ Analisis gambar siap! AI akan memahami konsep di gambar.</div>`
        : ''));

  preview.innerHTML = `
    <img src="${dataUrl}" class="image-preview-thumb" alt="preview" />
    <div class="image-preview-info">
      <strong>${escapeHtml(img.fileName || 'gambar')}</strong>
      ${fileSizeKB} KB • ${img.mimeType}
      ${img.analysis ? '<br/><span style="color: var(--accent);">✓ Analisis siap</span>' : ''}
    </div>
    <button class="image-preview-remove" onclick="clearAttachedImage()">✕ Hapus</button>
    ${statusHtml}
  `;
  preview.style.display = 'flex';
}

// ============================================================
// Sessions persistence
// ============================================================
function persistSession() {
  if (state.messages.length === 0) return;
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.topic === state.topic && s.mode === state.mode);
  const now = Date.now();
  const session = idx >= 0
    ? { ...sessions[idx], messages: state.messages, updatedAt: now }
    : { id: uid(), topic: state.topic, mode: state.mode, messages: state.messages, createdAt: now, updatedAt: now };
  const next = idx >= 0 ? sessions.map((s, i) => i === idx ? session : s) : [session, ...sessions].slice(0, 50);
  saveSessions(next);
}

// ============================================================
// Evaluation
// ============================================================
async function handleEvaluate() {
  const userTranscript = state.messages.filter(m => m.role === 'user' && !m.error).map(m => m.text).join('\n\n');
  if (userTranscript.length < 30) {
    showToast('Penjelasan terlalu pendek (min 30 karakter). Jelaskan topik lebih lanjut dulu.', 'warning');
    return;
  }

  $('eval-modal').style.display = 'flex';
  state.isEvaluating = true;
  state.evalResult = null;
  state.evalError = null;
  state.scoreDropInfo = null;
  renderEvalBody();

  const aiQuestions = state.messages.filter(m => m.role === 'assistant' && !m.error).map(m => m.text);
  const result = await evaluateExplanation(state.mode, state.topic, userTranscript, aiQuestions);

  state.isEvaluating = false;

  if (result.ok) {
    state.evalResult = result;
    const player = getCurrentPlayer();
    const previous = getPreviousEvaluation(state.topic, state.mode, player.name);

    saveEvaluation(result, player.name);

    if (previous && result.percentage < previous.percentage) {
      const drop = previous.percentage - result.percentage;
      state.scoreDropInfo = { drop, previousPercentage: previous.percentage };
      if (drop >= 5) {
        showToast(`📉 Skor turun ${drop}%! Dari ${previous.percentage}% → ${result.percentage}%`, 'error');
        // Fire browser notification
        showNotification(
          `📉 Skor turun ${drop}%`,
          `Topik "${state.topic}" (${state.mode}): dari ${previous.percentage}% jadi ${result.percentage}%. Cek perbaikan di panel nilai.`,
          'score-drop'
        );
      }
    }

    const target = getTarget(state.topic, state.mode);
    if (target && result.percentage >= target.targetPercentage) {
      showToast(`🎯 Target tercapai! ${result.percentage}% vs target ${target.targetPercentage}%`, 'success');
      // Fire celebratory notification
      showNotification(
        `🎯 Target tercapai!`,
        `${result.percentage}% (target: ${target.targetPercentage}%) untuk "${state.topic}". Kerja bagus!`,
        'target-hit'
      );
    }

    showToast(`Nilai: ${result.grade} (${result.percentage}%)`, 'success');
  } else {
    state.evalError = result.error || 'Gagal menilai.';
  }

  renderEvalBody();
}

function renderEvalBody() {
  const body = $('eval-body');
  const userTranscript = state.messages.filter(m => m.role === 'user' && !m.error).map(m => m.text).join('\n\n');

  if (state.isEvaluating) {
    body.innerHTML = `
      <div class="recorder-stage-processing">
        <div class="spinner"></div>
        <p>AI sedang menilai penjelasanmu...</p>
        <p class="help-text">Biasanya 10-30 detik</p>
      </div>
    `;
    return;
  }

  if (state.evalError && !state.evalResult) {
    body.innerHTML = `
      <div class="recorder-stage-error">
        <p style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</p>
        <p style="font-weight: 600; margin-bottom: 0.5rem;">Gagal menilai</p>
        <p class="help-text">${escapeHtml(state.evalError)}</p>
        <button class="btn btn-primary" onclick="handleEvaluate()" style="margin-top: 1rem;">Coba lagi</button>
      </div>
    `;
    return;
  }

  if (!state.evalResult) {
    body.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <div style="font-size: 3rem; margin-bottom: 0.75rem;">📊</div>
        <h3 style="margin-bottom: 0.5rem;">Siap dinilai?</h3>
        <p class="help-text" style="margin-bottom: 1.5rem; max-width: 400px; margin-left: auto; margin-right: auto;">
          AI akan menilai penjelasanmu berdasarkan 7 dimensi: kesederhanaan, kejelasan, akurasi, kedalaman, struktur, analogi, dan koreksi.
        </p>
        <button class="btn btn-primary btn-lg" onclick="handleEvaluate()">✨ Nilai Penjelasan Saya</button>
        ${userTranscript.length < 30 ? '<p class="help-text" style="margin-top: 0.75rem; color: var(--warn);">Jelaskan topik lebih lanjut dulu (min 30 karakter).</p>' : ''}
      </div>
    `;
    return;
  }

  const r = state.evalResult;
  const gradeClass = `grade-${r.grade.toLowerCase().replace('+', '-plus')}`;
  let html = `
    <div class="grade-card ${gradeClass}">
      <div>
        <p style="opacity: 0.8; font-size: 0.85rem;">Skor total</p>
        <div><span style="font-size: 2rem; font-weight: 800;">${r.totalScore}</span><span style="opacity: 0.7;"> / ${r.maxTotal}</span></div>
      </div>
      <div style="text-align: right;">
        <div class="grade-letter">${r.grade}</div>
        <p style="opacity: 0.9; font-size: 0.75rem;">${r.percentage}%</p>
      </div>
    </div>
    <p class="grade-label" style="color: var(--text); margin-bottom: 1rem;">${r.gradeLabel}</p>
  `;

  if (state.scoreDropInfo && state.scoreDropInfo.drop > 0) {
    html += `<div style="background: rgba(239,68,68,0.1); border: 2px solid var(--danger); border-radius: 0.5rem; padding: 0.6rem; margin-bottom: 1rem; font-size: 0.85rem; color: var(--danger);">
      📉 Skor turun ${state.scoreDropInfo.drop}%! Sebelumnya ${state.scoreDropInfo.previousPercentage}% → sekarang ${r.percentage}%.
    </div>`;
  }

  html += `<div class="eval-section"><h3>Rincian 7 Dimensi</h3>`;
  for (const d of r.dimensions) {
    const pct = d.score / d.maxScore;
    const color = pct >= 0.8 ? 'var(--accent)' : pct >= 0.5 ? 'var(--warn)' : 'var(--danger)';
    html += `
      <div class="dimension-row">
        <div class="dimension-header">
          <div><span style="font-size: 1.1rem;">${d.icon}</span> <span class="dimension-label">${d.label}</span></div>
          <div class="dimension-score" style="color: ${color};">${d.score.toFixed(1)} / ${d.maxScore}</div>
        </div>
        <div class="dimension-bar"><div class="dimension-bar-fill" style="width: ${pct * 100}%; background: ${color};"></div></div>
        <div class="dimension-feedback">${escapeHtml(d.feedback)}</div>
      </div>
    `;
  }
  html += `</div>`;

  if (r.summary) {
    html += `<div class="eval-summary"><h3 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem;">✨ Ringkasan</h3><p>${escapeHtml(r.summary)}</p></div>`;
  }

  if (r.strengths.length > 0) {
    html += `<div class="eval-section strengths"><h3>💪 Kekuatan</h3><ul style="list-style: none;">${r.strengths.map(s => `<li style="padding: 0.2rem 0; font-size: 0.85rem;"><span style="color: var(--accent);">✓</span> ${escapeHtml(s)}</li>`).join('')}</ul></div>`;
  }

  if (r.improvements.length > 0) {
    html += `<div class="eval-section improvements"><h3>📉 Perbaikan</h3><ul style="list-style: none;">${r.improvements.map(s => `<li style="padding: 0.2rem 0; font-size: 0.85rem;"><span style="color: var(--danger);">→</span> ${escapeHtml(s)}</li>`).join('')}</ul></div>`;
  }

  if (r.corrections.length > 0) {
    html += `<div class="eval-section corrections"><h3>⚠️ Daftar Koreksi (${r.corrections.length})</h3>`;
    for (const [i, c] of r.corrections.entries()) {
      const sevLabel = c.severity === 'high' ? 'Fatal' : c.severity === 'medium' ? 'Penting' : 'Minor';
      const typeLabels = { factual: 'Fakta Salah', logical: 'Logika Salah', conceptual: 'Konsep Salah', omission: 'Ada yang Tertinggal', vague: 'Terlalu Kabur', analogy_wrong: 'Analogi Salah', terminology: 'Istilah Salah', other: 'Lainnya' };
      html += `
        <div class="correction-item ${c.severity}">
          <div class="correction-badges">
            <span class="correction-badge ${c.severity}">${sevLabel}</span>
            <span class="correction-badge type">${typeLabels[c.errorType] || 'Lainnya'}</span>
            <span style="font-size: 0.65rem; color: var(--text-muted); margin-left: auto;">Koreksi #${i + 1}</span>
          </div>
          <div class="correction-field">
            <div class="correction-field-label">Kutipan (yang kamu bilang)</div>
            <div class="correction-quote">"${escapeHtml(c.quote)}"</div>
          </div>
          <div class="correction-field">
            <div class="correction-field-label">Mengapa salah</div>
            <div class="correction-explanation">${escapeHtml(c.explanation)}</div>
          </div>
          <div class="correction-correct">
            <div class="correction-correct-label">✓ Koreksi yang benar</div>
            ${escapeHtml(c.correction)}
          </div>
        </div>
      `;
    }
    html += `</div>`;
  } else {
    html += `<div class="no-corrections"><p style="font-weight: 600; color: var(--accent);">✅ Tidak ada kesalahan spesifik ditemukan!</p><p class="help-text" style="margin-top: 0.25rem;">Penjelasanmu akurat secara fakta, logika, dan konsep.</p></div>`;
  }

  if (r.nextFocus) {
    html += `<div class="eval-next-focus"><h3>🎯 Fokus Sesi Berikutnya</h3><p style="font-size: 0.9rem;">${escapeHtml(r.nextFocus)}</p></div>`;
  }

  html += `<button class="btn btn-outline" style="width: 100%; margin-top: 1rem;" onclick="handleEvaluate()">✨ Nilai Ulang</button>`;

  body.innerHTML = html;
}

// ============================================================
// Target modal
// ============================================================
function renderTargetModal() {
  const body = $('target-body');
  const targets = loadTargets().sort((a, b) => b.updatedAt - a.updatedAt);
  let html = `
    <div class="target-form">
      <p style="font-weight: 600; margin-bottom: 0.5rem;">➕ Tambah Target Baru</p>
      <div class="target-form-row">
        <input type="text" id="new-target-topic" placeholder="Topik (mis. Quantum Physics)" value="${escapeHtml(state.topic)}" />
      </div>
      <div class="target-form-row">
        <input type="number" id="new-target-score" min="1" max="100" placeholder="Target %" value="85" style="width: 100px;" />
        <select id="new-target-mode">
          <option value="coach" ${state.mode === 'coach' ? 'selected' : ''}>Coach</option>
          <option value="student" ${state.mode === 'student' ? 'selected' : ''}>Murid</option>
          <option value="hybrid" ${state.mode === 'hybrid' ? 'selected' : ''}>Gabungan</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="addTarget()">Simpan</button>
      </div>
      <p class="help-text">Contoh: "Aku harus dapet 90 di Quantum Physics (mode coach)"</p>
    </div>
  `;

  if (targets.length === 0) {
    html += `<div class="empty-list"><div class="empty-list-icon">🏆</div>Belum ada target. Set target untuk motivasi!</div>`;
  } else {
    html += `<p class="section-label">${targets.length} Target Aktif</p>`;
    for (const t of targets) {
      const isCurrent = t.topic === state.topic && t.mode === state.mode;
      html += `
        <div class="target-list-item ${isCurrent ? 'current' : ''}">
          <div class="target-list-info">
            <div class="target-list-topic">${escapeHtml(t.topic)}</div>
            <div class="target-list-meta">${t.mode} • Target: <strong style="color: var(--accent);">${t.targetPercentage}%</strong></div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="removeTarget('${escapeHtml(t.topic)}', '${t.mode}')">🗑️</button>
        </div>
      `;
    }
  }

  body.innerHTML = html;
}

function addTarget() {
  const topic = $('new-target-topic').value.trim();
  const score = parseInt($('new-target-score').value, 10);
  const mode = $('new-target-mode').value;
  if (!topic || !score || score < 1 || score > 100) { showToast('Isi topik dan skor (1-100)', 'warning'); return; }
  setTarget(topic, mode, score);
  renderTargetModal();
  updateHomeInfo();
  showToast('Target tersimpan!', 'success');
}
function removeTarget(topic, mode) { deleteTarget(topic, mode); renderTargetModal(); updateHomeInfo(); }

// ============================================================
// Leaderboard modal
// ============================================================
function renderLeaderboardModal() {
  const body = $('leaderboard-body');
  const entries = getLeaderboard();
  const players = loadPlayers();
  const currentId = getCurrentPlayerId();

  let html = '';

  if (entries.length === 0) {
    html += `<div class="empty-list"><div class="empty-list-icon">🏆</div>Belum ada skor tersimpan. Mulai sesi & nilai penjelasanmu!</div>`;
  } else {
    html += `<p class="section-label">Peringkat Berdasarkan Skor Terbaik</p>`;
    for (const [i, e] of entries.entries()) {
      const isCurrent = players.find(p => p.name === e.player)?.id === currentId;
      const medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      html += `
        <div class="leaderboard-entry ${isCurrent ? 'current' : ''}">
          <div class="leaderboard-rank">${medal}</div>
          <div class="leaderboard-info">
            <div class="leaderboard-name">${escapeHtml(e.player)}${isCurrent ? ' (Kamu)' : ''}</div>
            <div class="leaderboard-meta">${e.totalSessions} sesi • ${e.topicsCovered} topik • avg ${e.averagePercentage}%</div>
          </div>
          <div class="leaderboard-score">${e.bestPercentage}%</div>
        </div>
      `;
    }
  }

  html += `<div class="divider"></div>`;
  html += `<p class="section-label">Daftar Pemain (${players.length})</p>`;
  html += `<div style="display: flex; gap: 0.4rem; margin-bottom: 0.75rem;"><input type="text" id="new-player-name" placeholder="Nama anggota kelas..." style="flex: 1; background: var(--bg-card-2); border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.4rem; color: var(--text); font-size: 0.85rem;" /><button class="btn btn-primary btn-sm" onclick="addPlayerFromModal()">➕</button></div>`;

  for (const p of players) {
    const isCurrent = p.id === currentId;
    html += `
      <div class="player-list-item ${isCurrent ? 'current' : ''}">
        <button class="player-name-btn" onclick="switchPlayer('${p.id}')">${escapeHtml(p.name)}${isCurrent ? ' ✓' : ''}</button>
        ${p.id !== 'me' ? `<button class="btn btn-ghost btn-sm" onclick="removePlayer('${p.id}')">🗑️</button>` : ''}
      </div>
    `;
  }
  html += `<p class="help-text" style="margin-top: 0.5rem;">Klik nama untuk ganti pemain aktif. Sesi evaluasi akan dicatat atas nama pemain aktif.</p>`;

  body.innerHTML = html;
}

function addPlayerFromModal() {
  const name = $('new-player-name').value.trim();
  if (!name) return;
  addPlayer(name);
  renderLeaderboardModal();
  updateHomeInfo();
}
function removePlayer(id) { deletePlayer(id); renderLeaderboardModal(); updateHomeInfo(); }
function switchPlayer(id) { setCurrentPlayerId(id); state.currentPlayer = getCurrentPlayer(); renderLeaderboardModal(); updateHomeInfo(); showToast(`Pemain aktif: ${state.currentPlayer.name}`); }

// ============================================================
// Trend modal
// ============================================================
function renderTrendModal() {
  const body = $('trend-body');
  const evals = loadEvaluations();

  if (evals.length === 0) {
    body.innerHTML = `<div class="empty-list" style="padding: 3rem;"><div style="font-size: 3rem; opacity: 0.2; margin-bottom: 0.5rem;">📈</div><p style="font-weight: 600;">Belum ada skor tersimpan</p><p class="help-text">Selesaikan satu sesi & nilai penjelasanmu untuk mulai melihat tren.</p></div>`;
    return;
  }

  const topics = [...new Set(evals.map(e => e.topic))].sort();
  const players = [...new Set(evals.map(e => e.player))].sort();
  const avg = Math.round((evals.reduce((s, e) => s + e.percentage, 0) / evals.length) * 10) / 10;
  const best = Math.max(...evals.map(e => e.percentage));

  let html = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Sesi</div><div class="stat-value">${evals.length}</div></div>
      <div class="stat-card"><div class="stat-label">Rata-rata</div><div class="stat-value">${avg}%</div></div>
      <div class="stat-card"><div class="stat-label">Terbaik</div><div class="stat-value">${best}%</div></div>
    </div>
    <div class="filter-row">
      <select id="trend-topic-filter" class="filter-select"><option value="all">Semua Topik</option>${topics.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</select>
      <select id="trend-player-filter" class="filter-select"><option value="all">Semua Pemain</option>${players.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}</select>
    </div>
  `;

  // Simple SVG chart
  const trend = getTrendData('all', 'all');
  if (trend.length > 0) {
    const w = 600, h = 180, padding = 30;
    const maxPct = 100;
    const xStep = trend.length > 1 ? (w - padding * 2) / (trend.length - 1) : 0;
    const points = trend.map((t, i) => `${padding + i * xStep},${h - padding - (t.percentage / maxPct) * (h - padding * 2)}`).join(' ');
    html += `
      <div class="chart-container">
        <p class="section-label">Rata-rata Skor per Minggu</p>
        <svg viewBox="0 0 ${w} ${h}" style="width: 100%; height: auto;">
          <line x1="${padding}" y1="${h - padding}" x2="${w - padding}" y2="${h - padding}" stroke="#475569" stroke-width="1" />
          <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${h - padding}" stroke="#475569" stroke-width="1" />
          <text x="${padding - 5}" y="${padding + 5}" fill="#94a3b8" font-size="10" text-anchor="end">100</text>
          <text x="${padding - 5}" y="${h - padding}" fill="#94a3b8" font-size="10" text-anchor="end">0</text>
          <polyline points="${points}" fill="none" stroke="#10b981" stroke-width="3" />
          ${trend.map((t, i) => `<circle cx="${padding + i * xStep}" cy="${h - padding - (t.percentage / maxPct) * (h - padding * 2)}" r="4" fill="#10b981" /><text x="${padding + i * xStep}" y="${h - padding + 15}" fill="#94a3b8" font-size="8" text-anchor="middle">${t.weekLabel.split(' ').slice(0, 2).join(' ')}</text>`).join('')}
        </svg>
        ${trend.length === 1 ? '<p class="help-text" style="text-align: center;">Butuh minimal 2 minggu untuk melihat garis tren.</p>' : ''}
      </div>
    `;
  }

  // History list
  html += `<p class="section-label">Riwayat Evaluasi Terbaru</p>`;
  const recent = evals.slice(0, 30);
  const gradeColors = { 'A+': '#10b981', 'A': '#22c55e', 'B': '#eab308', 'C': '#f97316', 'D': '#ef4444', 'F': '#dc2626' };
  for (const e of recent) {
    html += `
      <div class="eval-history-item">
        <div class="eval-history-grade" style="color: ${gradeColors[e.grade]};">${e.grade}</div>
        <div class="eval-history-info">
          <div class="eval-history-topic">${escapeHtml(e.topic)}</div>
          <div class="eval-history-meta">${escapeHtml(e.player)} • ${e.mode} • ${formatTime(e.createdAt)}</div>
        </div>
        <div class="eval-history-score">${e.percentage}%</div>
        <button class="btn btn-ghost btn-sm" onclick="deleteEval('${e.id}')">🗑️</button>
      </div>
    `;
  }

  body.innerHTML = html;
}

function deleteEval(id) {
  saveJSON(KEYS.evaluations, loadEvaluations().filter(e => e.id !== id));
  renderTrendModal();
}

// ============================================================
// History modal
// ============================================================
function renderHistoryModal() {
  const body = $('history-body');
  const sessions = loadSessions();
  if (sessions.length === 0) {
    body.innerHTML = `<div class="empty-list"><div class="empty-list-icon">📋</div>Belum ada sesi tersimpan.</div>`;
    return;
  }
  let html = '';
  for (const s of sessions) {
    html += `
      <div class="history-item" onclick="loadSession('${s.id}')">
        <div class="history-item-info" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div class="history-topic">${escapeHtml(s.topic)}</div>
            <div class="history-meta">
              <span style="text-transform: capitalize; padding: 0.1rem 0.4rem; border: 1px solid var(--border); border-radius: 999px; font-size: 0.65rem;">${s.mode}</span>
              <span>${s.messages.length} pesan</span>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteSession('${s.id}')">✕</button>
        </div>
      </div>
    `;
  }
  body.innerHTML = html;
}

function loadSession(id) {
  const s = loadSessions().find(x => x.id === id);
  if (!s) return;
  state.topic = s.topic; state.mode = s.mode; state.messages = s.messages;
  state.evalResult = null; state.evalError = null; state.scoreDropInfo = null;
  $('history-modal').style.display = 'none';
  startSession();
}
function deleteSession(id) {
  saveSessions(loadSessions().filter(s => s.id !== id));
  renderHistoryModal();
  updateHomeInfo();
}

// ============================================================
// Persona picker
// ============================================================
function renderPersonaPicker() {
  const body = $('persona-picker-body');
  const personas = listPersonasByRole(state.mode);
  let html = `
    <button class="persona-option" onclick="pinPersona(null)" style="background: rgba(16,185,129,0.1); border-color: var(--accent);">
      <div class="persona-option-icon">🤖</div>
      <div class="persona-option-info">
        <div class="persona-option-name">Auto Router (rekomendasi)</div>
        <div class="persona-option-tag">Smart router memilih AI terbaik tiap pesan</div>
      </div>
    </button>
    <p class="section-label" style="margin-top: 1rem;">${personas.length} AI tersedia untuk mode ${state.mode}</p>
  `;
  for (const p of personas) {
    const selected = state.pinnedPersonaId === p.id;
    html += `
      <button class="persona-option ${selected ? 'selected' : ''}" onclick="pinPersona('${p.id}')">
        <div class="persona-option-icon">${p.emoji}</div>
        <div class="persona-option-info">
          <div class="persona-option-name">${p.name}</div>
          <div class="persona-option-tag">${p.tagline}</div>
          <div class="persona-option-badges">
            <span class="correction-badge type" style="background: ${p.providerColor}; color: #fff; border: none;">${p.provider}</span>
            ${p.specialties.slice(0, 3).map(s => `<span class="correction-badge type">${s}</span>`).join('')}
          </div>
        </div>
      </button>
    `;
  }
  body.innerHTML = html;
}

function pinPersona(id) {
  state.pinnedPersonaId = id;
  $('persona-modal').style.display = 'none';
  $('persona-btn').textContent = id ? '⚙️ AI: pinned' : '⚙️ AI: auto';
  if (id) {
    const p = getPersonaById(id);
    showToast(`${p.emoji} ${p.name} dipilih`, 'success');
  }
}

// ============================================================
// Settings modal — API key configuration
// ============================================================
function renderSettingsModal() {
  const body = $('settings-body');
  const { provider, apiKey } = getAIConfig();
  const hasKey = hasAIKey();

  body.innerHTML = `
    <div style="margin-bottom: 1rem;">
      <p style="font-weight: 600; margin-bottom: 0.5rem;">🔑 API Key AI</p>
      <p class="help-text" style="margin-bottom: 1rem;">
        Versi web butuh API key gratis dari OpenRouter atau Google AI Studio.
        API key disimpan lokal di browser-mu (localStorage) — tidak dikirim ke server mana pun.
      </p>
    </div>

    <div style="margin-bottom: 1rem;">
      <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.4rem;">Provider</label>
      <select id="ai-provider" style="width: 100%; background: var(--bg-card-2); border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.5rem; color: var(--text); font-size: 0.9rem; font-family: inherit;">
        <option value="openrouter" ${provider === 'openrouter' ? 'selected' : ''}>OpenRouter (multiple free models)</option>
        <option value="google" ${provider === 'google' ? 'selected' : ''}>Google AI Studio (Gemini — support audio/video 30 menit)</option>
      </select>
    </div>

    <div style="margin-bottom: 1rem;" id="gemini-model-row" ${provider !== 'google' ? 'style="display:none;"' : ''}>
      <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.4rem;">Model Gemini (untuk transkripsi audio/video)</label>
      <select id="gemini-model" style="width: 100%; background: var(--bg-card-2); border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.5rem; color: var(--text); font-size: 0.9rem; font-family: inherit;">
        <option value="gemini-2.5-flash" ${getGeminiModel() === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash (terbaru, recommended)</option>
        <option value="gemini-2.0-flash" ${getGeminiModel() === 'gemini-2.0-flash' ? 'selected' : ''}>gemini-2.0-flash (akurat, stabil)</option>
        <option value="gemini-2.0-flash-lite" ${getGeminiModel() === 'gemini-2.0-flash-lite' ? 'selected' : ''}>gemini-2.0-flash-lite (ringan, cepat)</option>
        <option value="gemini-2.5-pro" ${getGeminiModel() === 'gemini-2.5-pro' ? 'selected' : ''}>gemini-2.5-pro (paling akurat, lebih lambat)</option>
      </select>
      <p class="help-text" style="margin-top: 0.3rem;">Untuk transkripsi panjang, gunakan 2.5-flash atau 2.5-pro.</p>
    </div>

    <div style="margin-bottom: 1rem;">
      <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.4rem;">API Key</label>
      <input type="password" id="ai-apikey" placeholder="sk-or-v1-... atau AIza..." value="${escapeHtml(apiKey)}" style="width: 100%; background: var(--bg-card-2); border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.5rem; color: var(--text); font-size: 0.9rem; font-family: monospace;" />
      <p class="help-text" style="margin-top: 0.4rem;">
        Dapatkan gratis di:<br/>
        • OpenRouter: <a href="https://openrouter.ai/keys" target="_blank" style="color: var(--accent);">openrouter.ai/keys</a> (sign up → create key, gratis $1 credit)<br/>
        • Google AI Studio: <a href="https://aistudio.google.com/apikey" target="_blank" style="color: var(--accent);">aistudio.google.com/apikey</a> (sign in → Create API key)
      </p>
    </div>

    <div style="background: rgba(59,130,246,0.1); border-left: 4px solid var(--info); border-radius: 0.4rem; padding: 0.75rem; margin-bottom: 1rem;">
      <p style="font-size: 0.85rem; font-weight: 600; color: var(--info); margin-bottom: 0.25rem;">ℹ️ Informasi</p>
      <p style="font-size: 0.8rem; color: var(--text-muted);">
        ${hasKey ? '✅ API key sudah diset. App siap pakai.' : '⚠️ Belum ada API key. Set dulu untuk mulai chat dengan AI.'}<br/>
        30 AI persona tetap tersedia — smart router akan pilih model terbaik dari provider yang dipilih.<br/>
        API key disimpan lokal di browser, tidak pernah dikirim ke server kami.<br/>
        💡 Untuk rekam audio/video, gunakan provider Google AI Studio (Gemini support multimodal).
      </p>
    </div>

    <div style="background: rgba(16,185,129,0.1); border-left: 4px solid var(--accent); border-radius: 0.4rem; padding: 0.75rem; margin-bottom: 1rem;">
      <p style="font-size: 0.85rem; font-weight: 600; color: var(--accent); margin-bottom: 0.4rem;">🔔 Notifikasi Browser</p>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">
        Aktifkan untuk dapat notifikasi saat skor turun atau target tercapai.
        Status: <strong id="notif-status-text">${getNotificationPermission() === 'granted' ? '✅ Aktif' : getNotificationPermission() === 'denied' ? '❌ Diblokir (cek settings browser)' : getNotificationPermission() === 'unsupported' ? '⚠️ Tidak didukung' : '⏳ Belum diizinkan'}</strong>
      </p>
      ${getNotificationPermission() !== 'granted' && getNotificationPermission() !== 'unsupported' && getNotificationPermission() !== 'denied' ? `<button class="btn btn-primary btn-sm" onclick="enableNotifications()">🔔 Aktifkan Notifikasi</button>` : ''}
      ${getNotificationPermission() === 'granted' ? `<button class="btn btn-outline btn-sm" onclick="testNotification()">🔔 Test Notifikasi</button>` : ''}
    </div>

    <div style="display: flex; gap: 0.5rem;">
      <button class="btn btn-primary" onclick="saveAIKey()" style="flex: 1;">💾 Simpan</button>
      <button class="btn btn-outline" onclick="clearAIKey()">🗑️ Hapus Key</button>
    </div>
  `;
}

function saveAIKey() {
  const provider = $('ai-provider').value;
  const apiKey = $('ai-apikey').value.trim();
  if (!apiKey) { showToast('API key tidak boleh kosong', 'warning'); return; }
  setAIConfig(provider, apiKey);
  // Save Gemini model if Google provider
  if (provider === 'google') {
    const modelSelect = $('gemini-model');
    if (modelSelect) localStorage.setItem('feynman-gemini-model', modelSelect.value);
  }
  $('settings-modal').style.display = 'none';
  showToast('API key tersimpan! 🎉', 'success');
  updateHomeInfo();
}

function clearAIKey() {
  if (!confirm('Hapus API key?')) return;
  localStorage.removeItem('feynman-ai-provider');
  localStorage.removeItem('feynman-ai-apikey');
  renderSettingsModal();
  updateHomeInfo();
  showToast('API key dihapus');
}

async function enableNotifications() {
  const result = await requestNotificationPermission();
  if (result === 'granted') {
    showToast('✅ Notifikasi diaktifkan!', 'success');
    showNotification('Feynman Router', 'Notifikasi aktif! Kamu akan dapat ping saat skor turun atau target tercapai.', 'welcome');
  } else if (result === 'denied') {
    showToast('❌ Notifikasi diblokir. Enable di settings browser.', 'error');
  } else {
    showToast('Notifikasi tidak diizinkan.', 'warning');
  }
  renderSettingsModal();
}

function testNotification() {
  const ok = showNotification(
    '🔔 Test Notifikasi',
    'Kalau kamu lihat ini, notifikasi berfungsi dengan baik!',
    'test'
  );
  if (!ok) showToast('Notifikasi tidak bisa ditampilkan', 'warning');
}

// ============================================================
// Recorder modal
// ============================================================
function openRecorder() {
  $('recorder-modal').style.display = 'flex';
  setRecorderStage('idle');
}

function setRecorderStage(stage, msg) {
  const body = $('recorder-body');
  if (stage === 'idle') {
    body.innerHTML = `
      <div class="recorder-stage-idle">
        <p class="help-text" style="margin-bottom: 1rem;">Pilih mode rekaman. Suara akan ditranskripsi otomatis.</p>
        <div class="recorder-mode-grid">
          <button class="recorder-mode-btn" onclick="startRecording('audio')">
            <div class="recorder-mode-icon">🎤</div>
            <div class="recorder-mode-name">Rekam Suara</div>
            <div class="recorder-mode-tag">ASR otomatis</div>
          </button>
          <button class="recorder-mode-btn" onclick="startRecording('video')">
            <div class="recorder-mode-icon">📹</div>
            <div class="recorder-mode-name">Rekam Video</div>
            <div class="recorder-mode-tag">Audio + Visual</div>
          </button>
        </div>
        ${!window.MediaRecorder ? '<p class="help-text" style="color: var(--warn); margin-top: 1rem;">Browser tidak mendukung MediaRecorder. Pakai Chrome/Edge.</p>' : ''}
      </div>
    `;
  } else if (stage === 'recording') {
    const showVideo = mediaKind === 'video' && mediaStream;
    body.innerHTML = `
      <div class="recorder-stage-recording">
        <div class="recorder-pulse"><div class="recorder-pulse-inner">${mediaKind === 'audio' ? '🎤' : '📹'}</div></div>
        <div class="recorder-duration" id="recorder-duration">0:00</div>
        <div class="recorder-badge"><span class="pulse-dot"></span> Merekam ${mediaKind}...</div>
        ${showVideo ? `<div class="recorder-video-preview"><video id="recorder-video" autoplay muted playsinline></video></div>` : ''}
        <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1rem;">
          <button class="btn btn-outline" onclick="cancelRecording()">Batal</button>
          <button class="btn btn-danger" onclick="stopRecording()">⏹ Stop & Transkripsi</button>
        </div>
      </div>
    `;
    if (showVideo) {
      const v = $('recorder-video');
      if (v && mediaStream) {
        v.srcObject = mediaStream;
        v.play().catch(() => {});
      }
    }
  } else if (stage === 'processing') {
    body.innerHTML = `
      <div class="recorder-stage-processing">
        <div class="spinner"></div>
        <p style="font-weight: 600;">${msg || 'Memproses...'}</p>
        <p class="help-text">Mohon tunggu, jangan tutup aplikasi</p>
      </div>
    `;
  } else if (stage === 'done') {
    body.innerHTML = `
      <div class="recorder-stage-done">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">✅</div>
        <p style="font-weight: 600; margin-bottom: 0.5rem;">Berhasil!</p>
        <p class="help-text" style="margin-bottom: 1rem;">${msg}</p>
        <button class="btn btn-primary" onclick="closeRecorder()">Selesai</button>
      </div>
    `;
  } else if (stage === 'error') {
    body.innerHTML = `
      <div class="recorder-stage-error">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚠️</div>
        <p style="font-weight: 600; margin-bottom: 0.5rem;">Terjadi kesalahan</p>
        <p class="help-text" style="margin-bottom: 1rem;">${msg}</p>
        <button class="btn btn-outline" onclick="setRecorderStage('idle')">Coba Lagi</button>
      </div>
    `;
  }
}

async function startRecording(kind) {
  const ok = await startMediaRecorder(kind);
  if (ok) setRecorderStage('recording');
}
function stopRecording() { stopMediaRecorder(); }
function cancelRecording() { stopMediaRecorder(); stopMediaStream(); setRecorderStage('idle'); }
function closeRecorder() {
  $('recorder-modal').style.display = 'none';
  stopMediaStream();
}

// ============================================================
// Session lifecycle
// ============================================================
function startSession() {
  state.messages = [];
  state.evalResult = null; state.evalError = null; state.scoreDropInfo = null;
  state.closingDismissed = false; state.closingForMsgId = null;
  hideClosingBanner();

  // Update UI
  $('mode-display').textContent = state.mode;
  $('topic-display').textContent = state.topic;
  $('persona-name').textContent = 'Menunggu AI pertama...';
  $('persona-avatar').textContent = '?';
  $('persona-avatar').style.background = 'var(--bg-card-2)';
  $('last-ai').textContent = '';

  // Empty state text based on mode
  const emptyText = state.mode === 'coach'
    ? 'Mulai menjelaskan topik dengan suara, ketik, atau rekam video. Coach akan mengoreksi & menanyakan hal-hal yang membuatmu berpikir lebih dalam.'
    : state.mode === 'student'
    ? 'Mulai menjelaskan topik seolah-olah mengajar murid. Murid AI akan bertanya polos tapi tajam — celah pemahamanmu akan terbongkar.'
    : 'Mode gabungan: jelaskan topikmu. AI akan bergantian jadi guru (mengoreksi) dan murid (bertanya). Bila kamu salah atau kurang jelas, AI tunjukkan bagian mana yang perlu diperbaiki.';
  $('empty-text').textContent = emptyText;

  // Reset messages view
  const msgs = $('messages');
  msgs.innerHTML = `<div class="empty-state"><div class="empty-icon">${state.mode === 'coach' ? '🎯' : state.mode === 'student' ? '🧒' : '✨'}</div><p class="empty-text">${emptyText}</p></div>`;

  // Target indicator
  const target = getTarget(state.topic, state.mode);
  $('target-indicator').style.display = target ? 'flex' : 'none';
  if (target) $('target-indicator').innerHTML = `🎯 ${target.targetPercentage}%`;

  showView('session');
}

function backToHome() {
  showView('home');
  updateHomeInfo();
}

function handleClear() {
  if (!confirm('Bersihkan riwayat sesi ini?')) return;
  state.messages = [];
  state.lastPersonaId = null;
  state.evalResult = null; state.evalError = null; state.scoreDropInfo = null;
  state.closingDismissed = false; state.closingForMsgId = null;
  state.attachedImage = null; state.isAnalyzingImage = false;
  hideClosingBanner();
  startSession();
  showToast('Riwayat sesi dibersihkan');
}

// ============================================================
// Home info
// ============================================================
function updateHomeInfo() {
  // Counts
  const sessions = loadSessions();
  const players = loadPlayers();
  $('history-count').textContent = sessions.length || '';
  $('player-count').textContent = players.length > 1 ? players.length : '';
  $('ai-count').textContent = ALL_PERSONAS.length;
  $('total-ais').textContent = ALL_PERSONAS.length;

  // Providers
  $('providers-list').innerHTML = FREE_PROVIDERS.map(p => `<span class="provider-tag">${p}</span>`).join('');

  // Player + target info
  const player = getCurrentPlayer();
  const target = state.topic ? getTarget(state.topic, state.mode) : null;
  const info = $('player-target-info');
  if (player.name === 'Saya' && !target) {
    info.innerHTML = state.topic.trim().length >= 3 ? `<button class="btn btn-ghost btn-sm" onclick="openTargetModal()">🎯 Set target skor</button>` : '';
  } else {
    info.innerHTML = `
      ${player.name !== 'Saya' ? `<span class="badge">👤 ${escapeHtml(player.name)}</span>` : ''}
      ${target ? `<span class="badge" style="border-color: var(--accent); color: var(--accent);">🎯 Target: ${target.targetPercentage}%</span>` : ''}
    `;
  }
}

// ============================================================
// Event listeners
// ============================================================
function init() {
  // Mode buttons
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      updateHomeInfo();
    });
  });

  // Settings modal — show/hide gemini model row when provider changes
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'ai-provider') {
      const modelRow = $('gemini-model-row');
      if (modelRow) modelRow.style.display = e.target.value === 'google' ? 'block' : 'none';
    }
  });

  // Topic input
  const topicInput = $('topic-input');
  topicInput.addEventListener('input', () => {
    state.topic = topicInput.value;
    $('start-btn').disabled = state.topic.trim().length < 3;
    $('start-hint').style.display = state.topic.trim().length < 3 ? 'block' : 'none';
    updateHomeInfo();
  });
  topicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.topic.trim().length >= 3) startSession();
  });

  // Start button
  $('start-btn').addEventListener('click', startSession);

  // Top action buttons
  $('settings-btn').addEventListener('click', () => { renderSettingsModal(); $('settings-modal').style.display = 'flex'; });
  $('history-btn').addEventListener('click', () => { renderHistoryModal(); $('history-modal').style.display = 'flex'; });
  $('target-btn').addEventListener('click', () => { renderTargetModal(); $('target-modal').style.display = 'flex'; });
  $('leaderboard-btn').addEventListener('click', () => { renderLeaderboardModal(); $('leaderboard-modal').style.display = 'flex'; });
  $('trend-btn').addEventListener('click', () => { renderTrendModal(); $('trend-modal').style.display = 'flex'; });

  // Modal close buttons
  $('back-btn').addEventListener('click', backToHome);
  $('history-close').addEventListener('click', () => $('history-modal').style.display = 'none');
  $('target-close').addEventListener('click', () => $('target-modal').style.display = 'none');
  $('leaderboard-close').addEventListener('click', () => $('leaderboard-modal').style.display = 'none');
  $('trend-close').addEventListener('click', () => $('trend-modal').style.display = 'none');
  $('recorder-close').addEventListener('click', closeRecorder);
  $('eval-close').addEventListener('click', () => $('eval-modal').style.display = 'none');
  $('persona-close').addEventListener('click', () => $('persona-modal').style.display = 'none');
  $('settings-close').addEventListener('click', () => $('settings-modal').style.display = 'none');

  // Session buttons
  $('mic-btn').addEventListener('click', toggleMic);
  $('record-btn').addEventListener('click', openRecorder);
  $('image-btn').addEventListener('click', () => $('image-input').click());
  $('image-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = ''; // reset so same file can be re-selected
  });

  // Drag & drop image support
  const msgInput = $('message-input');
  if (msgInput) {
    msgInput.addEventListener('dragover', (e) => { e.preventDefault(); msgInput.style.borderColor = 'var(--accent)'; });
    msgInput.addEventListener('dragleave', () => { msgInput.style.borderColor = ''; });
    msgInput.addEventListener('drop', (e) => {
      e.preventDefault();
      msgInput.style.borderColor = '';
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) handleImageUpload(file);
    });
    // Message input
    msgInput.addEventListener('input', () => { updateSendButton(); msgInput.style.height = 'auto'; msgInput.style.height = Math.min(msgInput.scrollHeight, 128) + 'px'; });
    msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
  }
  $('send-btn').addEventListener('click', handleSend);
  $('clear-btn').addEventListener('click', handleClear);
  $('evaluate-btn').addEventListener('click', () => { state.evalResult = null; state.evalError = null; $('eval-modal').style.display = 'flex'; renderEvalBody(); });
  $('speak-toggle').addEventListener('click', () => {
    state.autoSpeak = !state.autoSpeak;
    $('speak-toggle').textContent = state.autoSpeak ? '🔊' : '🔇';
    if (!state.autoSpeak && window.speechSynthesis) window.speechSynthesis.cancel();
  });
  $('persona-btn').addEventListener('click', () => { renderPersonaPicker(); $('persona-modal').style.display = 'flex'; });

  // Closing banner
  $('closing-evaluate').addEventListener('click', () => { hideClosingBanner(); state.evalResult = null; state.evalError = null; $('eval-modal').style.display = 'flex'; renderEvalBody(); });
  $('closing-dismiss').addEventListener('click', () => { hideClosingBanner(); state.closingDismissed = true; });

  // Close modals on backdrop click
  $$('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', (e) => { e.currentTarget.parentElement.style.display = 'none'; });
  });

  // ESC to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal').forEach(m => { if (m.style.display === 'flex' && !state.isEvaluating) m.style.display = 'none'; });
    }
  });

  // Load voices for TTS
  if (window.speechSynthesis) {
    speechSynthesisVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => { speechSynthesisVoices = window.speechSynthesis.getVoices(); };
  }

  // Initial state
  state.currentPlayer = getCurrentPlayer();
  updateHomeInfo();

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// Expose functions to global scope for inline onclick handlers
window.handleEvaluate = handleEvaluate;
window.addTarget = addTarget;
window.removeTarget = removeTarget;
window.addPlayerFromModal = addPlayerFromModal;
window.removePlayer = removePlayer;
window.switchPlayer = switchPlayer;
window.deleteEval = deleteEval;
window.loadSession = loadSession;
window.deleteSession = deleteSession;
window.pinPersona = pinPersona;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.cancelRecording = cancelRecording;
window.setRecorderStage = setRecorderStage;
window.closeRecorder = closeRecorder;
window.openTargetModal = () => { renderTargetModal(); $('target-modal').style.display = 'flex'; };
window.saveAIKey = saveAIKey;
window.clearAIKey = clearAIKey;
window.renderSettingsModal = renderSettingsModal;
window.enableNotifications = enableNotifications;
window.testNotification = testNotification;
window.handleImageUpload = handleImageUpload;
window.clearAttachedImage = clearAttachedImage;

// Init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
