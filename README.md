# GHOST · CONTEXT MOBILE

> Mobile-first, **offline** AI chat with a built-in RAG knowledge base.
> One target device, zero compromises: **Unisoc T606 · 4 GB RAM · Android 11**.

The app talks to a local **Ollama** running in Termux (or any reachable Ollama on your LAN). All your AI-course PDFs/MDs are pre-chunked and indexed (TF-IDF) into `public/kb-prebuilt.json` — answers are grounded in your notes first, model knowledge second.

---

## ⚡ Quick Start — Termux (clone → run, ~5 minutes)

> Use **Termux from F-Droid** ([f-droid.org/packages/com.termux](https://f-droid.org/packages/com.termux/)). The Play Store build is years out of date and `pkg` will fail.

```sh
# 1. one-time Termux setup
pkg update -y && pkg upgrade -y
pkg install -y git nodejs ollama

# 2. clone this repo
git clone https://github.com/aint-vscp/ghost-context-mobile.git
cd ghost-context-mobile

# 3. install runtime deps (skips pdf-parse — only needed for re-chunking on a desktop)
npm install --omit=dev

# 4. start Ollama in the background and pull the model (~1 GB, one time)
OLLAMA_NUM_THREAD=6 OLLAMA_KEEP_ALIVE=5m nohup ollama serve >ollama.log 2>&1 &
ollama pull qwen2.5:1.5b

# 5. start the web app
node server.js
```

You'll see:
```
GHOST · CONTEXT listening on http://0.0.0.0:8787
```

Open **Chrome** on the same phone → `http://localhost:8787` → tap menu → **Add to Home Screen**. The icon now launches the app full-screen as a PWA.

### Helper script (optional)

A one-shot launcher is included:

```sh
bash run-termux.sh
```

It boots Ollama if it isn't already running, pulls `qwen2.5:1.5b` if missing, then starts the web server. Kill with `Ctrl+C` (Ollama keeps running in the background — `pkill ollama` to stop it).

### Stopping things
```sh
# stop the web app: Ctrl+C in the terminal running node
pkill -f "node server.js"   # or that, from another shell
pkill ollama                # stop the model server
```

---

## 🧠 Step 0 — Model selection (locked)

Default model: **`qwen2.5:1.5b` (Q4_K_M)**. Reasoning on Unisoc T606 (Cortex-A55 ×8 @ 1.6 GHz, no NPU, ~2.5 GB free RAM):

| Candidate | Q4_K_M size | RSS @ 2K ctx | tok/s on A55 | Verdict |
|---|---|---|---|---|
| Llama 3.2 1B Instruct | ~0.8 GB | ~1.2 GB | 5–7 | fast but weaker reasoning / Q&A |
| **Qwen2.5 1.5B Instruct** | **~1.0 GB** | **~1.4 GB** | **3–5** | **best instruction-following + Q&A in budget; multilingual incl. Tagalog** |
| Gemma 2 2B Instruct | ~1.6 GB | ~2.1 GB | 1–2 | borderline OOM with browser + Termux running |
| Phi-3.5 mini 3.8B | ~2.3 GB | ~3.0 GB | <1 | will OOM |

`qwen2.5:1.5b` leaves ~1 GB headroom for Chrome + Termux + KV growth, runs at usable speed when Ollama is launched with `OLLAMA_NUM_THREAD=6` (the 6 perf cores), and ships strong structured-answer + multilingual behaviour that suits the AI-course study use case bundled in `kb-prebuilt.json`.

The **CFG** tab inside the app lets you swap to anything else `ollama list` reports (e.g. `llama3.2:1b` if you want raw speed, `qwen2.5:3b` if you have headroom on a desktop endpoint).

---

## 📚 Pre-chunked knowledge base (sample, included)

The repo ships with a ready-to-use sample KB so the app is useful out of the box — you can chat about Introduction-to-AI topics without uploading anything.

`public/kb-prebuilt.json` contains:

| | |
|---|---|
| Topic | **COMP 304 — Introduction to Artificial Intelligence** (Intro / Agents / Search) |
| Total chunks | **234** |
| Source files | 5 markdown notes + 5 lecture PDFs |
| Index | TF-IDF (cosine), built once at chunk time |
| Chunk size | 512 tokens (≈ 2048 chars) |
| Overlap | 64 tokens (≈ 256 chars) |
| Size on wire | 1.09 MB (gzips well; cached by service worker after first load) |

### Build your own KB

Drop your own files into the `corpus/` folders and rebuild:

```sh
# put .md files in corpus/md and .pdf files in corpus/pdf, then:
npm install        # one-time (installs pdf-parse devDep)
node tools/prechunk.js
```

Or point the script anywhere with env vars:

```sh
KB_MD_DIR=/path/to/notes KB_SRC_DIR=/path/to/pdfs node tools/prechunk.js
```

You can also ingest files at runtime via the **Library** tab inside the app (PDF / PPTX / MD / TXT, with OCR fallback for scanned PDFs) — those go into the browser's IndexedDB and merge with the prebuilt index automatically.

---

## 📂 Repo layout

```
ghost-context-mobile/
├── public/
│   ├── index.html        single-page UI (chat / quick / library / cfg)
│   ├── app.js            vanilla JS — chat, RAG retrieval, ingestion, slash, voice, PWA
│   ├── style.css         terminal-ghost dark theme (cyan-on-black, scanlines)
│   ├── manifest.json     PWA manifest
│   ├── sw.js             service worker (app shell offline)
│   ├── icons/icon.svg    brand glyph
│   └── kb-prebuilt.json  234 pre-chunked AI-course chunks + TF-IDF index
├── corpus/
│   ├── md/               drop your .md files here
│   └── pdf/              drop your .pdf files here
├── tools/
│   └── prechunk.js       Node script that builds kb-prebuilt.json from corpus/
├── server.js             Termux-friendly Express static server
├── run-termux.sh         one-shot launcher (Ollama + web app)
├── package.json
├── .gitignore
└── README.md             ← you are here
```

JS+CSS payload: **39 KB**. PDF.js, JSZip, Tesseract.js are **lazy-loaded from CDN only when a file is uploaded** — first chat doesn't pay for them.

---

## ✨ Features

| Spec | Where |
|---|---|
| Single static app, no build, vanilla JS | `public/` |
| Streaming `/api/chat`, rAF-throttled at ~30 fps | `app.js` → `callOllama` + `throttledAppender` |
| RAG with TF-IDF (top-K, cosine) | `app.js` → `retrieve` / `buildSystem` |
| PDF + PPTX + MD ingestion | `extractPdf`, `extractPptx`, `extractMarkdownOrTxt` |
| OCR fallback w/ live progress + Eng/Tagalog dropdown | `extractPdf` → Tesseract.js worker, terminated after use |
| 512/64-token chunking | `chunkText` |
| Library tab w/ delete, drag-drop, persistent IDB | `view-lib`, `dbDeleteFile`, `handleFiles` |
| Quick Ask, top-1 context, single-shot | `view-quick`, `runQuick` |
| Markdown rendering (bold/code/lists/tables) | `renderMarkdown` |
| Last 10 conv. saved to localStorage | `saveHistory` |
| Voice via `webkitSpeechRecognition` | `setupVoice` |
| Slash cmds: `/help /skill /clear /model /kb /ask` | `runSlash` |
| 5 skills: summarize, explain, quiz, translate, rewrite | `SKILLS` map |
| PWA + offline shell + AI-offline banner | `sw.js`, `setAiState` |
| Dark OLED theme + scanlines + monospace accents | `style.css` |

---

## 🔌 Use a desktop Ollama instead (optional, much faster)

If your PC has a GPU or just more RAM, run Ollama there and point the phone at it.

On the desktop:
```sh
# Linux/macOS
OLLAMA_HOST=0.0.0.0:11434 ollama serve
ollama pull qwen2.5:7b   # or whatever your machine handles
```
On Windows:
```powershell
$env:OLLAMA_HOST="0.0.0.0:11434"
ollama serve
```

In the phone app: **CFG → Ollama endpoint →** `http://<desktop-LAN-ip>:11434` → CFG → Model → pick the bigger model. Connection state shows in the top bar.

---

## 🧪 Smoke checks (desktop dev)

```powershell
node -c public\app.js          # syntax
node -c server.js
node tools/prechunk.js         # rebuild KB
node server.js                 # serve, then visit http://localhost:8787
```

---

## ⚙️ Performance hygiene (T606-specific)

- Animations are `transform`/`opacity` only — no layout-triggering properties.
- Tesseract worker is `terminate()`-ed the moment OCR finishes (frees ~150 MB).
- IDB writes are awaited but never block UI rendering.
- `num_thread: 6` and `num_ctx: 2048` are sent to Ollama on every request to keep per-token latency predictable on Cortex-A55.
- Service worker excludes the Ollama port and CDN origins from caching (no stale model lists, no CORS surprises).
- No polling loops, no background timers, no heartbeat pings.

---

## 📜 License

Personal project — all yours.
