#!/usr/bin/env bash
# Runs the app's logic tests. Needs nothing but Node — no npm install.
set -euo pipefail
cd "$(dirname "$0")/.."
TZ=Europe/Berlin node --test test/*.test.mjs
