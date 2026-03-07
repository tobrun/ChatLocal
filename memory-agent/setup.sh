#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "[memory-agent] Creating Python virtual environment..."
python3 -m venv venv
echo "[memory-agent] Installing dependencies..."
venv/bin/pip install --quiet -r requirements.txt
echo "[memory-agent] Setup complete."
