#!/bin/bash
# Renders the synthetic sample documents in documents.tsv to PDF and PNG with headless Chrome.
# Every company, person, and amount in them is made up.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$HERE/pdf
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE=$(mktemp -d)
mkdir -p "$OUT"

tail -n +2 "$HERE/documents.tsv" | while IFS=$'\t' read -r file title sender date body; do
  html=$(mktemp).html
  cat > "$html" <<HTML
<!doctype html><meta charset="utf-8">
<style>body{font:15px/1.5 Georgia,serif;margin:64px;color:#222}h1{font-size:22px}p.meta{color:#666}</style>
<h1>$title</h1>
<p class="meta">$sender. $date.</p>
<p>$body</p>
<p class="meta">Sample document made for testing. Not a real record.</p>
HTML
  "$CHROME" --headless --disable-gpu --user-data-dir="$PROFILE" --no-pdf-header-footer \
    --print-to-pdf="$OUT/$file.pdf" "file://$html" > /dev/null 2>&1
  "$CHROME" --headless --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" --window-size=1240,1754 \
    --screenshot="$OUT/$file.png" "file://$html" > /dev/null 2>&1
  rm "$html"
done
rm -rf "$PROFILE"
ls "$OUT"
