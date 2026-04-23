// GHOST · CONTEXT MOBILE — Termux-friendly Express server
// Usage:  node server.js   (defaults: 0.0.0.0:8787)
const path    = require('path');
const express = require('express');

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const app  = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cache-Control', req.path === '/' || req.path.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// fallback for SPA-ish refreshes
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, HOST, () => {
  console.log(`GHOST · CONTEXT listening on http://${HOST}:${PORT}`);
  console.log(`open in your phone browser, or "Add to Home Screen" for the PWA`);
});
