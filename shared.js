/* ═══════════════════════════════════════════════════════════════
   shared.js  —  ಕನ್ನಡ Study Buddy  v6.0
   Shared by index.html, chapter1.html, chapter2.html, etc.
   Contains: IndexedDB cache, Sarvam TTS engine, star rewards,
             speaker/model validation, storage size display.
═══════════════════════════════════════════════════════════════ */

const PROXY_URL  = 'https://sarvam-kn-proxy.achallakiran.workers.dev';
const DB_NAME    = 'KannadaStudyBuddy';
const DB_VERSION = 1;
const STORE      = 'audioCache';

/* ── Speaker lists per model ──────────────────────────────────
   bulbul:v2  only supports a small fixed set.
   bulbul:v3  supports 35+ voices.
   Mixing them causes "speaker X not supported" errors.
─────────────────────────────────────────────────────────────── */
const SPEAKERS = {
  'bulbul:v2': [
    { value:'anushka', label:'Anushka ⭐ (default)' },
    { value:'manisha', label:'Manisha' },
    { value:'vidya',   label:'Vidya' },
    { value:'arya',    label:'Arya' },
    { value:'abhilash',label:'Abhilash (M)' },
    { value:'karun',   label:'Karun (M)' },
    { value:'hitesh',  label:'Hitesh (M)' },
  ],
  'bulbul:v3': [
    { value:'kavya',   label:'Kavya ⭐ (teacher)' },
    { value:'priya',   label:'Priya' },
    { value:'neha',    label:'Neha' },
    { value:'ritu',    label:'Ritu' },
    { value:'pooja',   label:'Pooja' },
    { value:'kavitha', label:'Kavitha' },
    { value:'shruti',  label:'Shruti' },
    { value:'suhani',  label:'Suhani' },
    { value:'roopa',   label:'Roopa' },
    { value:'ishita',  label:'Ishita' },
    { value:'aditya',  label:'Aditya (M)' },
    { value:'rahul',   label:'Rahul (M)' },
  ],
};
const DEFAULT_SPEAKER = { 'bulbul:v2': 'anushka', 'bulbul:v3': 'kavya' };

/* ── Populate speaker dropdown when model changes ─────────── */
function syncSpeakerDropdown() {
  const modelSel   = document.getElementById('modelSel');
  const speakerSel = document.getElementById('speakerSel');
  if (!modelSel || !speakerSel) return;

  const model   = modelSel.value;
  const current = speakerSel.value;
  const list    = SPEAKERS[model] || SPEAKERS['bulbul:v3'];

  speakerSel.innerHTML = list.map(s =>
    `<option value="${s.value}"${s.value===current?'  selected':''}>${s.label}</option>`
  ).join('');

  // If current speaker not valid for this model, reset to default
  const valid = list.some(s => s.value === speakerSel.value);
  if (!valid) speakerSel.value = DEFAULT_SPEAKER[model];

  // Update cost badge
  const badge = document.getElementById('costBadge');
  if (badge) {
    if (model === 'bulbul:v3') {
      badge.textContent = '₹30/10K chars';
      badge.className   = 'cost-badge cost-v3';
    } else {
      badge.textContent = '₹15/10K chars';
      badge.className   = 'cost-badge cost-v2';
    }
  }

  // Clear in-memory cache (IDB clips still valid for same model)
  Object.keys(memCache).forEach(k => delete memCache[k]);
}

/* ═══════════════════════════════════════════════════════════
   INDEXEDDB PERSISTENT AUDIO CACHE
═══════════════════════════════════════════════════════════ */
const memCache = {};  // session-level memory cache
let   db       = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'cacheKey' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function idbGet(key) {
  if (!db) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

function idbPut(key, wavBytes, meta) {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put({
      cacheKey: key,
      wavBytes,
      model:    meta.model,
      speaker:  meta.speaker,
      savedAt:  Date.now(),
    });
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e.target.error);
  });
}

function idbGetAll() {
  if (!db) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function idbClear() {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e.target.error);
  });
}

function cacheKey(text) {
  const model = document.getElementById('modelSel')?.value || 'bulbul:v3';
  return model + '|' + text;
}

/* ── Storage size display ─────────────────────────────────── */
async function updateStorageDisplay() {
  const el = document.getElementById('cacheInfo');
  if (!el) return;
  try {
    const records = await idbGetAll();
    const count   = records.length;
    let   bytes   = 0;
    records.forEach(r => { if (r.wavBytes) bytes += r.wavBytes.byteLength; });
    const mb = (bytes / 1024 / 1024).toFixed(1);
    el.textContent = count
      ? `${count} clip${count!==1?'s':''} · ${mb} MB saved`
      : '0 clips saved';
  } catch(_) {
    el.textContent = '? clips';
  }
}

/* ── Manual cache clear with confirmation ─────────────────── */
async function clearCache() {
  const count = (await idbGetAll()).length;
  if (count === 0) { alert('No saved audio clips to delete.'); return; }
  if (!confirm(`Delete all ${count} saved audio clips from this device?\n\nThey will be re-downloaded from Sarvam next time you tap 🔊.`)) return;
  stopAudio();
  Object.keys(memCache).forEach(k => delete memCache[k]);
  await idbClear();
  await updateStorageDisplay();
}

/* ═══════════════════════════════════════════════════════════
   SARVAM TTS  — API call
═══════════════════════════════════════════════════════════ */
async function sarvamTTS(text) {
  const model   = document.getElementById('modelSel')?.value   || 'bulbul:v3';
  const speaker = document.getElementById('speakerSel')?.value || DEFAULT_SPEAKER[model];
  const pace    = parseFloat(document.getElementById('paceRange')?.value || '0.75');

  // Validate speaker for model (prevent the "speaker not supported" error)
  const validSpeakers = (SPEAKERS[model] || SPEAKERS['bulbul:v3']).map(s => s.value);
  const finalSpeaker  = validSpeakers.includes(speaker) ? speaker : DEFAULT_SPEAKER[model];

  const payload = { text, target_language_code:'kn-IN', speaker:finalSpeaker, model, pace, speech_sample_rate:24000 };

  let res;
  try {
    res = await fetch(PROXY_URL, {
      method:  'POST',
      mode:    'cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
  } catch(e) {
    throw new Error('Cannot reach voice server. Check internet connection.');
  }

  const raw = await res.text();
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = JSON.parse(raw); msg = j.error?.message || j.message || msg; } catch(_) {}
    throw new Error(msg);
  }

  const data = JSON.parse(raw);
  if (!data.audios?.[0]) throw new Error('No audio returned from Sarvam');

  // Decode base64 → Uint8Array (efficient binary storage)
  const b64 = data.audios[0];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ─── Play raw WAV bytes ──────────────────────────────────── */
async function playWavBytes(bytes) {
  stopAudio();
  const blob  = new Blob([bytes], { type:'audio/wav' });
  const url   = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  currentAudio  = audio;
  try { await audio.play(); } catch(e) { URL.revokeObjectURL(url); throw e; }
  return audio;
}

/* ─── Playback state ──────────────────────────────────────── */
let currentAudio = null;
let currentBtn   = null;
let currentCard  = null;

function stopAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (currentBtn) {
    currentBtn.classList.remove('loading','playing','err');
    currentBtn.innerHTML = '🔊 Speak';
    currentBtn = null;
  }
  if (currentCard) { currentCard.classList.remove('card-active'); currentCard = null; }
}

/* ─── Main speak function ─────────────────────────────────── */
async function speakKannada(text, btn, card, clickX, clickY) {
  if (currentBtn === btn) { stopAudio(); return; }
  stopAudio();
  currentBtn  = btn;
  currentCard = card || null;

  btn.classList.add('loading');
  btn.disabled = true;
  if (card) card.classList.add('card-active');

  const key = cacheKey(text);

  try {
    let wavBytes = null;

    // Layer 1 — in-memory (instant)
    if (memCache[key]) {
      btn.innerHTML = '🔊 …';
      wavBytes = memCache[key];
    }

    // Layer 2 — IndexedDB (device storage, fast)
    if (!wavBytes) {
      btn.innerHTML = '💾 …';
      const record = await idbGet(key);
      if (record?.wavBytes) {
        wavBytes = record.wavBytes;
        memCache[key] = wavBytes;
      }
    }

    // Layer 3 — Sarvam API (first time only, costs ₹)
    if (!wavBytes) {
      btn.innerHTML = '⏳ Fetching…';
      const model   = document.getElementById('modelSel')?.value   || 'bulbul:v3';
      const speaker = document.getElementById('speakerSel')?.value || DEFAULT_SPEAKER[model];
      wavBytes = await sarvamTTS(text);
      memCache[key] = wavBytes;
      idbPut(key, wavBytes, { model, speaker })
        .then(updateStorageDisplay)
        .catch(() => {});  // don't block playback if IDB write fails
    }

    btn.classList.remove('loading');
    btn.classList.add('playing');
    btn.innerHTML = '🔊 Playing…';
    btn.disabled  = false;

    const audio = await playWavBytes(wavBytes);
    awardStar(clickX || window.innerWidth/2, clickY || window.innerHeight/2);

    audio.onended = () => { if (currentBtn === btn) stopAudio(); };
    audio.onerror = () => {
      if (currentBtn === btn) {
        btn.classList.remove('playing'); btn.classList.add('err');
        btn.innerHTML = '⚠️ Playback err';
        setTimeout(() => {
          btn.classList.remove('err'); btn.innerHTML = '🔊 Speak';
          if (card) card.classList.remove('card-active');
          currentBtn = null; currentCard = null;
        }, 2500);
      }
    };

  } catch(e) {
    btn.classList.remove('loading'); btn.classList.add('err');
    btn.innerHTML = '⚠️ ' + (e.message || 'Error').substring(0, 24);
    btn.disabled  = false;
    if (card) card.classList.remove('card-active');
    currentBtn = null; currentCard = null;
    setTimeout(() => { btn.classList.remove('err'); btn.innerHTML = '🔊 Speak'; }, 4000);
  }
}

/* ═══════════════════════════════════════════════════════════
   STAR REWARD SYSTEM
═══════════════════════════════════════════════════════════ */
let starCount  = parseInt(localStorage.getItem('kn_stars')  || '0');
let playsToday = parseInt(sessionStorage.getItem('kn_plays') || '0');

function updateStarDisplay() {
  const el = document.getElementById('starCount');
  if (el) el.textContent = starCount;
}

function awardStar(x, y) {
  const burst = document.createElement('div');
  burst.className   = 'star-burst';
  burst.textContent = '⭐';
  burst.style.left  = (x - 16) + 'px';
  burst.style.top   = (y - 16) + 'px';
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 700);

  playsToday++;
  sessionStorage.setItem('kn_plays', playsToday);
  if (playsToday % 3 === 0) {
    starCount++;
    localStorage.setItem('kn_stars', starCount);
    updateStarDisplay();
    if (playsToday % 9 === 0) showStarCelebration();
  }
}

function showStarCelebration() {
  const messages = [
    { emoji:'🌟', title:'Superstar!',   sub:'You are learning so well!' },
    { emoji:'🏆', title:'Champion!',    sub:'Your Kannada is getting better!' },
    { emoji:'🎉', title:'Wonderful!',   sub:'Keep it up, champ!' },
    { emoji:'🦚', title:'Excellent!',   sub:'The peacock is proud of you!' },
    { emoji:'🚀', title:'Blast off!',   sub:'You are a reading rocket!' },
    { emoji:'🌸', title:'Beautiful!',   sub:'Such great listening!' },
  ];
  const m = messages[Math.floor(Math.random() * messages.length)];
  const ce = document.getElementById('celebEmoji');
  const ct = document.getElementById('celebTitle');
  const cs = document.getElementById('celebSub');
  const cst= document.getElementById('celebStars');
  if (ce)  ce.textContent  = m.emoji;
  if (ct)  ct.textContent  = m.title;
  if (cs)  cs.textContent  = m.sub;
  if (cst) cst.textContent = '⭐'.repeat(Math.min(starCount, 5)) + '  ' + starCount + ' total!';
  document.getElementById('celebration')?.classList.add('show');
}

function closeCelebration() {
  document.getElementById('celebration')?.classList.remove('show');
}

/* ═══════════════════════════════════════════════════════════
   PROGRESS TRACKING (per-chapter, per-session)
═══════════════════════════════════════════════════════════ */
const heardItems = new Set();

function markHeard(key) {
  heardItems.add(key);
}

function updateProgress(chapterId, totalItems) {
  const heard = [...heardItems].filter(k => k.startsWith(chapterId + ':')).length;
  const pct   = totalItems ? Math.min(100, Math.round(heard / totalItems * 100)) : 0;
  const fill  = document.getElementById('progressFill');
  const label = document.getElementById('progressLabel');
  if (fill)  fill.style.width  = pct + '%';
  if (label) label.textContent = pct + '% heard today';
}

/* ═══════════════════════════════════════════════════════════
   SHARED BOOT — call this from each page's <script>
═══════════════════════════════════════════════════════════ */
function bootShared(onReady) {
  updateStarDisplay();
  openDB()
    .then(database => {
      db = database;
      return updateStorageDisplay();
    })
    .catch(err => {
      console.warn('[KN] IndexedDB unavailable, using memory only:', err);
      db = null;
      const el = document.getElementById('cacheInfo');
      if (el) el.textContent = 'storage unavailable';
    })
    .finally(() => {
      if (typeof onReady === 'function') onReady();
    });
}
