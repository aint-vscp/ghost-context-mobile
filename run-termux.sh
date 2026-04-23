#!/usr/bin/env bash
# GHOST · CONTEXT MOBILE — one-shot Termux launcher
# Boots Ollama (if not already running), pulls the default model on first run, then serves the web app.
set -e

MODEL="${GHOST_MODEL:-qwen2.5:1.5b}"
PORT="${PORT:-8787}"

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "!! node not installed. Run: pkg install nodejs"
  exit 1
fi
if ! command -v ollama >/dev/null 2>&1; then
  echo "!! ollama not installed. Run: pkg install ollama"
  exit 1
fi

# install runtime deps if missing
if [ ! -d node_modules/express ]; then
  echo "## installing runtime deps"
  npm install --omit=dev --no-audit --no-fund
fi

# start ollama if not already serving
if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "## starting ollama (background)"
  OLLAMA_NUM_THREAD="${OLLAMA_NUM_THREAD:-6}" OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-5m}" \
    nohup ollama serve >ollama.log 2>&1 &
  # wait for ready
  for i in $(seq 1 30); do
    sleep 1
    curl -sf http://localhost:11434/api/tags >/dev/null 2>&1 && break
  done
fi

# pull model if not present
if ! ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$MODEL"; then
  echo "## pulling $MODEL (one-time, ~1 GB)"
  ollama pull "$MODEL"
fi

echo "## starting GHOST · CONTEXT on http://localhost:$PORT"
PORT="$PORT" exec node server.js
