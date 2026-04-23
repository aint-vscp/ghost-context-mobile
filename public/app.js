/* GHOST · CONTEXT MOBILE — app.js
 * vanilla JS · no frameworks · lazy-loads PDF.js / JSZip / Tesseract from CDN
 * target: Unisoc T606 / Android 11 / Chrome / WebView
 */
'use strict';

// ---------- tiny helpers ----------
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const debounce = (fn, ms=150) => { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtBytes = n => n<1024 ? n+' B' : n<1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(2)+' MB';

// ---------- state ----------
const STATE = {
  cfg: loadCfg(),
  history: loadHistory(),
  kb: { chunks: [], index: null, files: {} },     // unified KB (prebuilt + user)
  userFiles: [],                                    // user-ingested file metadata
  prebuiltCount: 0,
  models: [],
};

function loadCfg() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem('ghost.cfg') || '{}'); } catch {}
  return Object.assign({
    endpoint: 'http://localhost:11434',
    model: 'qwen2.5:1.5b',
    temp: 0.4,
    topK: 4,
    rag: true,
    ocrLang: 'eng',
  }, c);
}
function saveCfg() { localStorage.setItem('ghost.cfg', JSON.stringify(STATE.cfg)); }

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('ghost.history') || '[]'); } catch { return []; }
}
function saveHistory() {
  // cap to last 10 sessions but keep current as last
  const h = STATE.history.slice(-10);
  localStorage.setItem('ghost.history', JSON.stringify(h));
}

// ---------- IndexedDB for user-ingested chunks ----------
const DB_NAME = 'ghost-kb', DB_VER = 1;
let _dbp = null;
function db() {
  if (_dbp) return _dbp;
  _dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('files'))  d.createObjectStore('files',  { keyPath: 'name' });
      if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks', { keyPath: 'id' }).createIndex('byFile','sourceFile',{unique:false});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbp;
}
async function dbAll(store) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readonly');
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
async function dbPut(store, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(val);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function dbDeleteFile(name) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(['files','chunks'], 'readwrite');
    tx.objectStore('files').delete(name);
    const idx = tx.objectStore('chunks').index('byFile');
    const cur = idx.openCursor(IDBKeyRange.only(name));
    cur.onsuccess = (e) => { const c = e.target.result; if (c) { c.delete(); c.continue(); } };
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ---------- chunking + TF-IDF (matches prechunk.js) ----------
const CHARS_PER_TOKEN = 4;
const CHUNK_TOKENS = 512, OVERLAP_TOKENS = 64;
const CHUNK_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;
const STOP = new Set('a an the and or but if while of for to in on at by with from is are was were be been being this that these those it its as not no do does did so than then there here we you they i he she them us our your their'.split(' '));

function normalize(s) {
  return s.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function tokenize(s) {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !STOP.has(w));
}
function chunkText(text, sourceFile) {
  const out = [];
  const clean = normalize(text);
  if (!clean) return out;
  let i = 0, idx = 0;
  while (i < clean.length) {
    const end = Math.min(i + CHUNK_CHARS, clean.length);
    let slice = clean.slice(i, end);
    if (end < clean.length) {
      const ls = slice.lastIndexOf(' ');
      if (ls > CHUNK_CHARS * 0.6) slice = slice.slice(0, ls);
    }
    const realEnd = i + slice.length;
    out.push({ id: `${sourceFile}#u${idx++}`, sourceFile, pageHint: null, text: slice.trim(), user: true });
    if (realEnd >= clean.length) break;
    i = realEnd - OVERLAP_CHARS;
    if (i < 0) i = 0;
  }
  return out;
}

// rebuild full TF-IDF index over (prebuilt + user) chunks
function rebuildIndex() {
  const chunks = STATE.kb.chunks;
  const N = chunks.length;
  if (!N) { STATE.kb.index = { idf:{}, tfs:[] }; return; }
  const df = Object.create(null);
  const tfs = chunks.map(c => {
    const tf = Object.create(null);
    const toks = tokenize(c.text);
    for (const t of toks) tf[t] = (tf[t]||0)+1;
    for (const t of Object.keys(tf)) df[t] = (df[t]||0)+1;
    return { tf, len: toks.length };
  });
  const idf = Object.create(null);
  for (const t of Object.keys(df)) idf[t] = Math.log(1 + N / df[t]);
  const norms = tfs.map(({tf,len}) => {
    let s=0; for (const t of Object.keys(tf)) { const w=(tf[t]/Math.max(1,len))*(idf[t]||0); s+=w*w; }
    return Math.sqrt(s) || 1;
  });
  STATE.kb.index = { idf, tfs: tfs.map((x,i)=>({tf:x.tf,len:x.len,norm:norms[i]})) };
}

function retrieve(query, k=4) {
  const idx = STATE.kb.index;
  if (!idx || !STATE.kb.chunks.length) return [];
  const qToks = tokenize(query);
  if (!qToks.length) return [];
  const qtf = Object.create(null);
  for (const t of qToks) qtf[t] = (qtf[t]||0)+1;
  let qnorm = 0;
  const qw = Object.create(null);
  for (const t of Object.keys(qtf)) {
    const w = (qtf[t]/qToks.length) * (idx.idf[t]||0);
    qw[t] = w; qnorm += w*w;
  }
  qnorm = Math.sqrt(qnorm) || 1;
  const scores = idx.tfs.map((d, i) => {
    let dot = 0;
    for (const t of Object.keys(qw)) {
      const dt = d.tf[t]; if (!dt) continue;
      const dw = (dt/Math.max(1,d.len)) * (idx.idf[t]||0);
      dot += dw * qw[t];
    }
    return { i, score: dot / (qnorm * d.norm) };
  });
  scores.sort((a,b)=>b.score-a.score);
  return scores.slice(0, k).filter(s => s.score > 0.02).map(s => Object.assign({score:s.score}, STATE.kb.chunks[s.i]));
}

// ---------- prebuilt KB load + merge with user IDB chunks ----------
async function loadPrebuiltKB(force=false) {
  try {
    const r = await fetch('kb-prebuilt.json', { cache: force ? 'reload' : 'default' });
    if (!r.ok) throw new Error('no prebuilt KB');
    const data = await r.json();
    STATE.kb.chunks = data.chunks.map(c => Object.assign({user:false}, c));
    STATE.prebuiltCount = data.chunks.length;
    Object.assign(STATE.kb.files, data.files || {});
  } catch { STATE.prebuiltCount = 0; }
}
async function loadUserKB() {
  STATE.userFiles = await dbAll('files');
  const userChunks = await dbAll('chunks');
  STATE.kb.chunks = STATE.kb.chunks.concat(userChunks.map(c => Object.assign({user:true}, c)));
  for (const f of STATE.userFiles) STATE.kb.files[f.name] = f.chunkCount;
  rebuildIndex();
  renderLibrary();
}

// ---------- markdown (tiny renderer) ----------
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function renderMarkdown(src) {
  // code fences first (placeholder)
  const codes = []; src = src.replace(/```(\w+)?\n([\s\S]*?)```/g, (_,lang,code) => { codes.push({lang:lang||'',code}); return `\u0000C${codes.length-1}\u0000`; });
  let h = escapeHtml(src);
  // tables (simple pipe)
  h = h.replace(/(^\|.+\|\n\|[\s|:-]+\|\n(\|.+\|\n?)+)/gm, (m) => {
    const lines = m.trim().split('\n');
    const head = lines[0].split('|').slice(1,-1).map(s=>s.trim());
    const body = lines.slice(2).map(l => l.split('|').slice(1,-1).map(s=>s.trim()));
    return '<table><thead><tr>'+head.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>'+
      body.map(r=>'<tr>'+r.map(c=>`<td>${c}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
  });
  // headings
  h = h.replace(/^###### (.*)$/gm,'<h6>$1</h6>')
       .replace(/^##### (.*)$/gm,'<h5>$1</h5>')
       .replace(/^#### (.*)$/gm,'<h4>$1</h4>')
       .replace(/^### (.*)$/gm,'<h3>$1</h3>')
       .replace(/^## (.*)$/gm,'<h2>$1</h2>')
       .replace(/^# (.*)$/gm,'<h1>$1</h1>');
  // lists
  h = h.replace(/(^|\n)((?:- .*(?:\n|$))+)/g, (_,p,b) => p+'<ul>'+b.trim().split('\n').map(l=>`<li>${l.replace(/^- /,'')}</li>`).join('')+'</ul>');
  h = h.replace(/(^|\n)((?:\d+\. .*(?:\n|$))+)/g, (_,p,b) => p+'<ol>'+b.trim().split('\n').map(l=>`<li>${l.replace(/^\d+\. /,'')}</li>`).join('')+'</ol>');
  // bold/italic/inline-code
  h = h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
       .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g,'<em>$1</em>')
       .replace(/`([^`]+)`/g,'<code>$1</code>');
  // links
  h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  // line breaks (paragraphs)
  h = h.split(/\n{2,}/).map(p => /^<(h\d|ul|ol|table|pre)/.test(p) ? p : `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
  // restore code blocks
  h = h.replace(/\u0000C(\d+)\u0000/g, (_,i) => {
    const c = codes[+i]; return `<pre><code class="lang-${escapeHtml(c.lang)}">${escapeHtml(c.code)}</code></pre>`;
  });
  return h;
}

// ---------- chat rendering ----------
const chatlog = $('#chatlog');
function addMessage(role, text, citations=null) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.textContent = role === 'user' ? 'YOU' : 'GHOST · ' + STATE.cfg.model;
  const b = document.createElement('div'); b.className = 'bubble';
  b.innerHTML = role === 'ai' ? renderMarkdown(text) : escapeHtml(text);
  wrap.appendChild(meta); wrap.appendChild(b);
  if (citations && citations.length) {
    const c = document.createElement('div'); c.className = 'cite';
    c.innerHTML = 'sources: ' + citations.map(x => `<span>${escapeHtml(x.sourceFile)}${x.pageHint?` p.${x.pageHint}`:''}</span>`).join('');
    wrap.appendChild(c);
  }
  chatlog.appendChild(wrap);
  chatlog.scrollTop = chatlog.scrollHeight;
  return b;
}

// ---------- streaming chat to Ollama ----------
async function callOllama(messages, onToken, signal) {
  const url = STATE.cfg.endpoint.replace(/\/$/,'') + '/api/chat';
  const body = {
    model: STATE.cfg.model,
    messages,
    stream: true,
    options: { temperature: STATE.cfg.temp, num_thread: 6, num_ctx: 2048 },
  };
  const res = await fetch(url, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body), signal,
  });
  if (!res.ok || !res.body) throw new Error('Ollama HTTP '+res.status);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl+1);
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        if (j.message && j.message.content) onToken(j.message.content);
        if (j.done) return;
      } catch {}
    }
  }
}

// rAF-throttled appender (caps re-renders ~30fps)
function throttledAppender(el) {
  let pending = '', raf = 0, last = 0;
  return (chunk) => {
    pending += chunk;
    if (raf) return;
    raf = requestAnimationFrame((ts) => {
      raf = 0;
      if (ts - last < 33) { raf = requestAnimationFrame(() => { last=performance.now(); flush(); }); return; }
      last = ts; flush();
    });
    function flush() {
      el.innerHTML = renderMarkdown(el.__buf = (el.__buf||'') + pending);
      pending = '';
      chatlog.scrollTop = chatlog.scrollHeight;
    }
  };
}

// ---------- system prompt assembly with RAG ----------
const SKILLS = {
  summarize: 'You are an expert summarizer. Produce a concise, well-structured summary using bullet points and bold key terms. Avoid repetition.',
  explain:   'You are a patient teacher. Explain the concept step-by-step with simple analogies, then give one short example.',
  quiz:      'You are a quiz master. Generate 5 short questions with answers hidden under <details> tags, scaling difficulty from easy to hard.',
  translate: 'You are a translator. Detect the source language, translate to the target the user names, and preserve formatting.',
  rewrite:   'You are an editor. Rewrite the user text for clarity, concision, and a neutral professional tone. Output the rewrite only.',
};

function buildSystem(query, opts={topK:4, oneShot:false}) {
  let sys = 'You are GHOST, an offline AI assistant running on a low-power Android device. Be concise. Use markdown.';
  if (currentSkill) sys += '\n\nSKILL MODE — ' + currentSkill.toUpperCase() + ':\n' + SKILLS[currentSkill];
  if (!STATE.cfg.rag) return { system: sys, citations: [] };
  const k = opts.oneShot ? 1 : opts.topK;
  const hits = retrieve(query, k);
  if (!hits.length) return { system: sys, citations: [] };
  // budget total context to ~1500 tokens (~6000 chars)
  let budget = 6000;
  const used = [];
  for (const h of hits) {
    if (h.text.length > budget) { used.push(Object.assign({}, h, { text: h.text.slice(0, budget) })); break; }
    used.push(h); budget -= h.text.length + 50;
    if (budget <= 0) break;
  }
  const ctx = used.map((c,i) => `[${i+1}] (${c.sourceFile}${c.pageHint?` p.${c.pageHint}`:''})\n${c.text}`).join('\n\n');
  sys += `\n\n[CONTEXT]\n${ctx}\n[/CONTEXT]\nAnswer using the context above when relevant. If the answer isn't in the context, use your general knowledge and say so.`;
  return { system: sys, citations: used };
}

// ---------- chat send ----------
let currentSkill = null;
let currentAbort = null;

async function sendChat(text) {
  if (currentAbort) { try { currentAbort.abort(); } catch {} }
  if (!text.trim()) return;

  // slash commands intercept
  if (text.startsWith('/')) { return runSlash(text); }

  addMessage('user', text);
  const { system, citations } = buildSystem(text, { topK: STATE.cfg.topK });
  const aiBubble = addMessage('ai', '');
  aiBubble.__buf = '';
  const append = throttledAppender(aiBubble);

  // assemble message history (cap to last 10 turns)
  const msgs = [{ role:'system', content: system }];
  const tail = STATE.history.slice(-10);
  for (const m of tail) msgs.push(m);
  msgs.push({ role:'user', content: text });

  currentAbort = new AbortController();
  try {
    await callOllama(msgs, append, currentAbort.signal);
    const final = aiBubble.__buf || '';
    STATE.history.push({ role:'user', content: text });
    STATE.history.push({ role:'assistant', content: final });
    saveHistory();
    if (citations.length) {
      const c = document.createElement('div'); c.className = 'cite';
      c.innerHTML = 'sources: ' + citations.map(x => `<span>${escapeHtml(x.sourceFile)}${x.pageHint?` p.${x.pageHint}`:''}</span>`).join('');
      aiBubble.parentElement.appendChild(c);
    }
  } catch (e) {
    aiBubble.innerHTML = `<em style="color:var(--warn)">⚠ ${escapeHtml(e.message)}</em>`;
    pingOllama();
  } finally {
    currentAbort = null;
  }
}

// ---------- slash commands ----------
function runSlash(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(' ');
  switch (cmd) {
    case '/help':
      addMessage('ai', `**Slash commands**
- \`/skill <name>\` — load a skill (summarize, explain, quiz, translate, rewrite)
- \`/clear\` — clear current chat
- \`/model\` — open model switcher
- \`/kb\` — open library
- \`/ask <query>\` — jump to Quick Ask with query`);
      return;
    case '/skill':
      if (!SKILLS[arg]) { addMessage('ai', `unknown skill. available: ${Object.keys(SKILLS).join(', ')}`); return; }
      currentSkill = arg;
      addMessage('ai', `**skill loaded:** \`${arg}\``);
      return;
    case '/clear':
      STATE.history = []; saveHistory(); chatlog.innerHTML = '';
      currentSkill = null;
      return;
    case '/model':
      switchTab('cfg'); $('#cfg-model').focus(); return;
    case '/kb':
      switchTab('lib'); return;
    case '/ask':
      switchTab('quick');
      $('#quick-input').value = arg;
      if (arg) $('#quick-form').requestSubmit();
      return;
    default:
      addMessage('ai', `unknown command: \`${escapeHtml(cmd)}\` — try \`/help\``);
  }
}

// ---------- Quick Ask ----------
async function runQuick(q) {
  if (!q.trim()) return;
  const out = $('#quick-answer'); out.textContent = ''; out.__buf = '';
  $('#quick-meta').textContent = '… retrieving';
  const { system, citations } = buildSystem(q, { topK: 1, oneShot: true });
  $('#quick-meta').textContent = citations.length ? `ctx: ${citations[0].sourceFile}${citations[0].pageHint?` p.${citations[0].pageHint}`:''} · score ${citations[0].score.toFixed(2)}` : 'no context match — general knowledge';

  let pending=''; let raf=0;
  const append = (t) => {
    pending += t;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf=0; out.__buf += pending; out.textContent = out.__buf; pending=''; });
  };
  try {
    await callOllama([{role:'system',content:system},{role:'user',content:q}], append);
  } catch (e) {
    out.textContent = '⚠ ' + e.message; pingOllama();
  }
}

// ---------- ingestion (PDF / PPTX / MD / TXT) ----------
const CDN = {
  pdfjs:    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs',
  pdfjsWk:  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs',
  jszip:    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  tess:     'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js',
};

let _pdfjs=null, _jszip=null, _tess=null;
async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  const mod = await import(/* @vite-ignore */ CDN.pdfjs);
  mod.GlobalWorkerOptions.workerSrc = CDN.pdfjsWk;
  _pdfjs = mod; return mod;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('failed: '+src));
    document.head.appendChild(s);
  });
}
async function loadJSZip() { if (_jszip) return _jszip; await loadScript(CDN.jszip); _jszip = window.JSZip; return _jszip; }
async function loadTesseract() { if (_tess) return _tess; await loadScript(CDN.tess); _tess = window.Tesseract; return _tess; }

function ocrStatus(msg) { $('#ocr-status').textContent = msg || ''; }

async function extractMarkdownOrTxt(file) {
  return await file.text();
}

async function extractImage(file) {
  const Tess = await loadTesseract();
  const url = URL.createObjectURL(file);
  let worker = null;
  try {
    ocrStatus(`OCR ${file.name}…`);
    worker = await Tess.createWorker(STATE.cfg.ocrLang, 1, {
      logger: m => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          ocrStatus(`OCR ${file.name} · ${Math.round(m.progress*100)}%`);
        }
      },
    });
    const { data } = await worker.recognize(url);
    return (data.text || '').trim();
  } finally {
    URL.revokeObjectURL(url);
    if (worker) await worker.terminate();   // free RAM immediately
  }
}

async function extractPptx(file) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b) => {
    const na = +a.match(/(\d+)\.xml$/)[1], nb = +b.match(/(\d+)\.xml$/)[1]; return na-nb;
  });
  const out = [];
  for (let i=0; i<slides.length; i++) {
    const xml = await zip.file(slides[i]).async('string');
    // pull text inside <a:t>...</a:t>
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map(m => m[1]);
    if (texts.length) out.push(`# Slide ${i+1}\n` + texts.join('\n'));
  }
  return out.join('\n\n');
}

async function extractPdf(file) {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages = [];
  let needsOcr = [];
  for (let p=1; p<=pdf.numPages; p++) {
    ocrStatus(`Reading page ${p} of ${pdf.numPages}…`);
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const txt = tc.items.map(it => it.str).join(' ').trim();
    pages.push(txt);
    if (txt.replace(/\s+/g,'').length < 20) needsOcr.push(p);
    page.cleanup();
  }
  if (needsOcr.length) {
    const Tess = await loadTesseract();
    const worker = await Tess.createWorker(STATE.cfg.ocrLang);
    try {
      for (const p of needsOcr) {
        ocrStatus(`OCR page ${p} of ${pdf.numPages}…`);
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const { data } = await worker.recognize(canvas);
        pages[p-1] = (data.text||'').trim();
        page.cleanup();
        canvas.width = canvas.height = 0;
      }
    } finally {
      await worker.terminate();   // free RAM
    }
  }
  ocrStatus('');
  // also build a page map
  const fullText = pages.join('\n\n');
  return { text: fullText, pages };
}

const IMG_EXT = /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i;

async function ingestFile(file) {
  const name = file.name;
  const lower = name.toLowerCase();
  ocrStatus(`reading ${name} (${fmtBytes(file.size)})…`);
  let text = '', pages = null;
  try {
    if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')) {
      text = await extractMarkdownOrTxt(file);
    } else if (lower.endsWith('.pptx')) {
      text = await extractPptx(file);
    } else if (lower.endsWith('.pdf')) {
      const r = await extractPdf(file);
      text = r.text; pages = r.pages;
    } else if (IMG_EXT.test(lower) || (file.type && file.type.startsWith('image/'))) {
      text = await extractImage(file);
    } else { throw new Error('unsupported: ' + name); }
  } catch (e) {
    ocrStatus('error: ' + e.message);
    throw e;
  }
  // chunk + assign page hints (PDF only)
  const chunks = chunkText(text, name);
  if (pages) {
    const offsets = []; let acc = 0;
    for (const p of pages) { offsets.push(acc); acc += normalize(p).length + 2; }
    let cursor = 0;
    for (const c of chunks) {
      // find first page whose offset <= cursor
      let pn = 1;
      for (let i=0; i<offsets.length; i++) if (offsets[i] <= cursor) pn = i+1; else break;
      c.pageHint = pn;
      cursor += c.text.length;
    }
  }
  // persist
  await dbPut('files', { name, size: file.size, type: lower.split('.').pop(), chunkCount: chunks.length, addedAt: Date.now() });
  for (const c of chunks) await dbPut('chunks', c);
  ocrStatus(`ingested ${chunks.length} chunks from ${name}`);
  return chunks.length;
}

async function handleFiles(files) {
  const list = Array.from(files);
  let ok = 0, fail = 0;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    ocrStatus(`(${i+1}/${list.length}) ${f.name}`);
    try {
      await ingestFile(f);
      ok++;
    } catch (e) {
      console.error('ingest failed', f.name, e);
      fail++;
    }
  }
  // reload KB and reindex
  STATE.kb.chunks = [];
  STATE.kb.files = {};
  await loadPrebuiltKB();
  await loadUserKB();
  ocrStatus(`done · ${ok} ingested${fail?`, ${fail} failed`:''}`);
}

// ---------- library UI ----------
function renderLibrary() {
  const ul = $('#file-list'); ul.innerHTML = '';
  // prebuilt
  const all = [];
  for (const [name, count] of Object.entries(STATE.kb.files)) {
    const isUser = STATE.userFiles.find(x => x.name === name);
    all.push({ name, count, user: !!isUser });
  }
  all.sort((a,b) => (a.user === b.user) ? a.name.localeCompare(b.name) : (a.user ? -1 : 1));
  for (const f of all) {
    const li = document.createElement('li');
    if (!f.user) li.classList.add('prebuilt');
    li.innerHTML = `<div><span class="name">${escapeHtml(f.name)}</span><span class="meta">· ${f.count} chunks</span></div>`;
    if (f.user) {
      const del = document.createElement('button'); del.textContent = 'DELETE';
      del.onclick = async () => {
        await dbDeleteFile(f.name);
        STATE.kb.chunks = []; STATE.kb.files = {};
        await loadPrebuiltKB(); await loadUserKB();
      };
      li.appendChild(del);
    }
    ul.appendChild(li);
  }
  $('#lib-stats').textContent = `${STATE.kb.chunks.length} chunks · ${Object.keys(STATE.kb.files).length} files · prebuilt: ${STATE.prebuiltCount}`;
}

// ---------- voice ----------
function setupVoice() {
  const btn = $('#mic-btn');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.title = 'voice not supported'; btn.onclick = () => addMessage('ai','*voice input unsupported on this browser*'); return; }
  let rec = null, on = false;
  btn.onclick = () => {
    if (on) { rec && rec.stop(); return; }
    rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
    rec.onstart = () => { on = true; btn.classList.add('rec'); };
    rec.onresult = (e) => {
      let s=''; for (const r of e.results) s += r[0].transcript;
      $('#input').value = s;
    };
    rec.onerror = () => {};
    rec.onend = () => { on = false; btn.classList.remove('rec'); };
    rec.start();
  };
}

// ---------- model discovery / Ollama ping ----------
async function pingOllama() {
  const url = STATE.cfg.endpoint.replace(/\/$/,'') + '/api/tags';
  try {
    const r = await fetch(url, { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    STATE.models = (j.models || []).map(m => m.name);
    setAiState(true);
    refreshModelDropdown();
  } catch (e) {
    // CORS failures show as TypeError "Failed to fetch" with no .status — surface a hint
    const isCORSish = e instanceof TypeError;
    console.warn('[ghost] ollama ping failed for', url, e);
    setAiState(false, isCORSish
      ? `AI offline. Reach to ${STATE.cfg.endpoint} failed (likely CORS or Ollama not running). Start Ollama with OLLAMA_ORIGINS=* and retry.`
      : `AI offline. ${e.message} at ${STATE.cfg.endpoint}.`);
  }
}
function setAiState(ok, msg) {
  const el = $('#ai-state');
  el.dataset.ok = ok ? '1' : '0';
  el.textContent = ok ? 'AI · online' : 'AI · offline';
  const banner = $('#ai-banner');
  banner.hidden = !!ok;
  if (!ok && msg) banner.textContent = msg;
}
function refreshModelDropdown() {
  const sel = $('#cfg-model');
  const cur = STATE.cfg.model;
  sel.innerHTML = '';
  const list = STATE.models.length ? STATE.models : [cur];
  if (!list.includes(cur)) list.unshift(cur);
  for (const m of list) {
    const o = document.createElement('option'); o.value = m; o.textContent = m;
    if (m === cur) o.selected = true; sel.appendChild(o);
  }
}

// ---------- tabs ----------
function switchTab(name) {
  document.body.dataset.tab = name;
  $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.target === name)));
  $$('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + name));
}

// ---------- wire UI ----------
function init() {
  // tabs
  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.target)));

  // composer
  const input = $('#input');
  const autoSize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, window.innerHeight*0.35) + 'px'; };
  input.addEventListener('input', debounce(autoSize, 80));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); }
  });
  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    input.value = ''; autoSize();
    sendChat(v);
  });

  // quick
  $('#quick-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#quick-input').value.trim();
    if (v) runQuick(v);
  });
  $('#quick-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#quick-form').requestSubmit(); }
  });

  // upload / dropzone
  $('#file-input').addEventListener('change', (e) => handleFiles(e.target.files));
  const dz = $('#dropzone');
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  dz.addEventListener('click', () => $('#file-input').click());

  // ocr lang
  $('#ocr-lang').value = STATE.cfg.ocrLang;
  $('#ocr-lang').addEventListener('change', e => { STATE.cfg.ocrLang = e.target.value; saveCfg(); });

  // cfg
  $('#cfg-endpoint').value = STATE.cfg.endpoint;
  $('#cfg-temp').value     = STATE.cfg.temp;
  $('#t-out').textContent  = STATE.cfg.temp;
  $('#cfg-topk').value     = STATE.cfg.topK;
  $('#cfg-rag').checked    = STATE.cfg.rag;
  $('#cfg-endpoint').addEventListener('change', e => { STATE.cfg.endpoint = e.target.value.trim(); saveCfg(); pingOllama(); });
  $('#cfg-model').addEventListener('change',    e => { STATE.cfg.model = e.target.value; saveCfg(); });
  $('#cfg-temp').addEventListener('input', e => { STATE.cfg.temp = +e.target.value; $('#t-out').textContent = STATE.cfg.temp; saveCfg(); });
  $('#cfg-topk').addEventListener('change', e => { STATE.cfg.topK = Math.max(1, Math.min(8, +e.target.value||4)); saveCfg(); });
  $('#cfg-rag').addEventListener('change',  e => { STATE.cfg.rag = e.target.checked; saveCfg(); });
  $('#refresh-models').addEventListener('click', pingOllama);
  $('#cfg-clear-history').addEventListener('click', () => { STATE.history = []; saveHistory(); chatlog.innerHTML=''; });
  $('#cfg-reload-kb').addEventListener('click', async () => {
    STATE.kb.chunks = []; STATE.kb.files = {}; STATE.prebuiltCount = 0;
    await loadPrebuiltKB(true); await loadUserKB();
  });

  // voice
  setupVoice();

  // service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }

  // initial loads
  (async () => {
    await loadPrebuiltKB();
    await loadUserKB();
    pingOllama();
    // welcome
    if (!STATE.history.length) {
      addMessage('ai',
        `**GHOST online.** Model: \`${STATE.cfg.model}\`. KB: ${STATE.kb.chunks.length} chunks loaded.\n\n` +
        `Try: \`/help\` · \`/skill explain\` · \`/ask what is A* search\``);
    } else {
      // restore last 6 messages so the user has context
      const tail = STATE.history.slice(-6);
      for (const m of tail) addMessage(m.role === 'user' ? 'user' : 'ai', m.content);
    }
  })();
}
document.addEventListener('DOMContentLoaded', init);
