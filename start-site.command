#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22 or newer from https://nodejs.org/ and try again.'
  read -r -p 'Press Enter to close.'
  exit 1
fi
node scripts/open-local.mjs
