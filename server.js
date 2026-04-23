// GHOST · CONTEXT MOBILE — Termux-friendly Express server with Ollama proxy
//
// Why proxy? The web app is served from http://<host>:8787 and Ollama runs on
// http://localhost:11434. That's cross-origin, so the browser hits CORS.
// We avoid the whole problem by exposing /api/ollama/* on this server and
// streaming-forwarding to the real Ollama. Browser only ever talks to one origin.
//
// Env:
//   PORT          — default 8787
//   HOST          — default 0.0.0.0
//   OLLAMA_URL    — default http://127.0.0.1:11434

const path    = require('path');
const http    = require('http');
const express = require('express');

const PORT       = process.env.PORT || 8787;
const HOST       = process.env.HOST || '0.0.0.0';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const ollamaUrl  = new URL(OLLAMA_URL);

const app = express();
app.disable('x-powered-by');

// ---- Ollama proxy ---------------------------------------------------------
function proxyToOllama(req, res) {
  const upstreamPath = req.originalUrl.replace(/^\/api\/ollama/, '/api');
  const opts = {
    protocol: ollamaUrl.protocol,
    hostname: ollamaUrl.hostname,
    port:     ollamaUrl.port || (ollamaUrl.protocol === 'https:' ? 443 : 80),
    path:     upstreamPath,
    method:   req.method,
    headers:  Object.assign({}, req.headers, { host: ollamaUrl.host }),
  };
  delete opts.headers['content-length']; // re-set by node
  const upstream = http.request(opts, (ur) => {
    res.writeHead(ur.statusCode || 502, ur.headers);
    ur.pipe(res);
  });
  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream_unreachable', detail: err.message, ollama_url: OLLAMA_URL }));
  });
  req.pipe(upstream);
}
app.all('/api/ollama/*', proxyToOllama);

// quick health check the app uses to badge online/offline
app.get('/healthz/ollama', async (_req, res) => {
  const opts = {
    protocol: ollamaUrl.protocol, hostname: ollamaUrl.hostname,
    port: ollamaUrl.port || 80, path: '/api/tags', method: 'GET', timeout: 2000,
  };
  const r = http.request(opts, (ur) => {
    let body = '';
    ur.on('data', c => body += c);
    ur.on('end', () => {
      try {
        const j = JSON.parse(body);
        res.json({ ok: true, models: (j.models || []).map(m => m.name) });
      } catch { res.json({ ok: false, error: 'bad_json' }); }
    });
  });
  r.on('error', e => res.json({ ok: false, error: e.code || e.message, ollama_url: OLLAMA_URL }));
  r.on('timeout', () => { r.destroy(); res.json({ ok: false, error: 'timeout', ollama_url: OLLAMA_URL }); });
  r.end();
});

// ---- static UI ------------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('Cache-Control', req.path === '/' || req.path.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, HOST, () => {
  console.log(`GHOST · CONTEXT listening on http://${HOST}:${PORT}`);
  console.log(`  proxying /api/ollama/* -> ${OLLAMA_URL}`);
});
