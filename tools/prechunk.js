#!/usr/bin/env node
// prechunk.js — turns local MDs + PDFs into public/kb-prebuilt.json
//
// Usage:
//   KB_MD_DIR=./corpus/md  KB_SRC_DIR=./corpus/pdf  node tools/prechunk.js
//   KB_MD_DIR=./notes node tools/prechunk.js              # MDs only
//   node tools/prechunk.js                                 # uses defaults below
//
// Defaults look for ./corpus/md and ./corpus/pdf (relative to repo root).
// Drop your .md files in one and your .pdf files in the other, then run.
//
// Output: public/kb-prebuilt.json (chunks + TF-IDF index, loaded by the web app).

const fs = require('fs');
const path = require('path');

const REPO    = path.join(__dirname, '..');
const MD_DIR  = process.env.KB_MD_DIR  || path.join(REPO, 'corpus', 'md');
const SRC_DIR = process.env.KB_SRC_DIR || path.join(REPO, 'corpus', 'pdf');
const OUT     = path.join(REPO, 'public', 'kb-prebuilt.json');

// ---- chunking knobs (matches the in-app chunker) ----
const CHARS_PER_TOKEN = 4;
const CHUNK_TOKENS    = 512;
const OVERLAP_TOKENS  = 64;
const CHUNK_CHARS     = CHUNK_TOKENS  * CHARS_PER_TOKEN;   // 2048
const OVERLAP_CHARS   = OVERLAP_TOKENS * CHARS_PER_TOKEN;  // 256

// ---- light text normalisation ----
function normalize(s) {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text, sourceFile, pageMap = null) {
  const out = [];
  const clean = normalize(text);
  if (!clean) return out;
  let i = 0, idx = 0;
  while (i < clean.length) {
    const end = Math.min(i + CHUNK_CHARS, clean.length);
    let slice = clean.slice(i, end);
    // try not to cut a word in half
    if (end < clean.length) {
      const lastSpace = slice.lastIndexOf(' ');
      if (lastSpace > CHUNK_CHARS * 0.6) slice = slice.slice(0, lastSpace);
    }
    const realEnd = i + slice.length;
    const pageHint = pageMap ? pageMap(i, realEnd) : null;
    out.push({
      id: `${path.basename(sourceFile)}#${idx++}`,
      sourceFile: path.basename(sourceFile),
      pageHint,
      text: slice.trim(),
    });
    if (realEnd >= clean.length) break;
    i = realEnd - OVERLAP_CHARS;
    if (i < 0) i = 0;
  }
  return out;
}

// ---- TF-IDF index (built once, shipped to client) ----
const STOP = new Set(('a an the and or but if while of for to in on at by with from is are was were be been being ' +
  'this that these those it its as not no do does did so than then there here we you they i he she them us our your their').split(' '));

function tokenize(s) {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !STOP.has(w));
}

function buildIndex(chunks) {
  const df = Object.create(null);
  const tfs = chunks.map(c => {
    const tf = Object.create(null);
    const toks = tokenize(c.text);
    for (const t of toks) tf[t] = (tf[t] || 0) + 1;
    for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
    return { tf, len: toks.length };
  });
  const N = chunks.length;
  const idf = Object.create(null);
  for (const t of Object.keys(df)) idf[t] = Math.log(1 + N / df[t]);
  // pre-compute doc vector norms for cosine
  const norms = tfs.map(({ tf, len }) => {
    let s = 0;
    for (const t of Object.keys(tf)) {
      const w = (tf[t] / Math.max(1, len)) * (idf[t] || 0);
      s += w * w;
    }
    return Math.sqrt(s) || 1;
  });
  // store sparse tf as { term: count } per chunk; idf shipped separately
  return { df, idf, tfs: tfs.map((x, i) => ({ tf: x.tf, len: x.len, norm: norms[i] })) };
}

// ---- ingest MDs ----
async function ingestMarkdown(allChunks) {
  if (!fs.existsSync(MD_DIR)) { console.log(`  (skip MD: ${MD_DIR} not found)`); return; }
  for (const f of fs.readdirSync(MD_DIR).filter(n => n.toLowerCase().endsWith('.md'))) {
    const full = path.join(MD_DIR, f);
    const raw  = fs.readFileSync(full, 'utf8');
    // strip obvious front-matter / wikilinks brackets but keep text
    const text = raw
      .replace(/^---[\s\S]*?---\n/, '')
      .replace(/!\[\[[^\]]*\]\]/g, '')
      .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b || a);
    const cs = chunkText(text, full);
    console.log(`  MD  ${f}  -> ${cs.length} chunks`);
    allChunks.push(...cs);
  }
}

// ---- ingest PDFs (pdf-parse) ----
async function ingestPdfs(allChunks) {
  if (!fs.existsSync(SRC_DIR)) { console.log(`  (skip PDF: ${SRC_DIR} not found)`); return; }
  let pdfParse;
  try { pdfParse = require('pdf-parse'); }
  catch { console.error('!! pdf-parse not installed. Run: npm i pdf-parse'); process.exit(1); }
  for (const f of fs.readdirSync(SRC_DIR).filter(n => n.toLowerCase().endsWith('.pdf'))) {
    const full = path.join(SRC_DIR, f);
    const buf  = fs.readFileSync(full);
    let pages = [];
    try {
      const data = await pdfParse(buf, {
        pagerender: async (pageData) => {
          const tc = await pageData.getTextContent();
          const txt = tc.items.map(it => it.str).join(' ');
          pages.push(txt);
          return txt + '\n';
        },
      });
      // pageMap: char-offset -> 1-based page #
      const offsets = []; let acc = 0;
      for (const p of pages) { offsets.push(acc); acc += normalize(p).length + 1; }
      const pageMap = (start) => {
        let lo = 0, hi = offsets.length - 1, ans = 0;
        while (lo <= hi) { const m = (lo+hi)>>1; if (offsets[m] <= start) { ans = m; lo = m+1; } else hi = m-1; }
        return ans + 1;
      };
      const cs = chunkText(data.text, full, pageMap);
      console.log(`  PDF ${f}  pages=${pages.length}  chunks=${cs.length}`);
      allChunks.push(...cs);
    } catch (e) {
      console.error(`  !! failed ${f}: ${e.message}`);
    }
  }
}

(async () => {
  const t0 = Date.now();
  const chunks = [];
  console.log('# Markdown');
  await ingestMarkdown(chunks);
  console.log('# PDF');
  await ingestPdfs(chunks);

  console.log(`\nTotal chunks: ${chunks.length}`);
  console.log('Building TF-IDF index...');
  const index = buildIndex(chunks);

  // file list summary
  const files = {};
  for (const c of chunks) files[c.sourceFile] = (files[c.sourceFile] || 0) + 1;

  const payload = {
    schema: 'ghost-kb/1',
    builtAt: new Date().toISOString(),
    tokenizer: 'js-tfidf-v1',
    chunkTokens: CHUNK_TOKENS,
    overlapTokens: OVERLAP_TOKENS,
    files,
    chunks,
    index,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`\n-> ${OUT}  (${kb} KB, ${Date.now()-t0} ms)`);
})();
