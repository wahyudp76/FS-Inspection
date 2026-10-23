#!/usr/bin/env bash
# Build dashboard ke folder docs/ lalu commit + push (GitHub Pages: Deploy from a branch)
set -e
cd "$(dirname "$0")/.."
npm run build:pages
touch docs/.nojekyll
git add docs
git commit -m "build(pages): perbarui bundle docs/ ($(date +%Y-%m-%d\ %H:%M))" || echo "Tidak ada perubahan untuk di-commit."
git push origin main
echo "✔ docs/ terkirim. GitHub Pages akan refresh dalam ±1 menit."
