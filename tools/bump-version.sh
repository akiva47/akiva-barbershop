#!/bin/sh
# Give every local stylesheet and script a fresh URL.
#
# GitHub Pages serves everything with Cache-Control: max-age=600, and an app
# installed to the iOS home screen holds onto that copy far more stubbornly
# than a browser tab does. Asking a cache to refresh is unreliable; changing
# the URL is not. Run this before every push that touches css/ or js/.
set -e
cd "$(dirname "$0")/.."

V=$(date -u +%Y%m%d%H%M)

for f in index.html admin.html cancel.html; do
  [ -f "$f" ] || continue
  # Rewrite an existing ?v=... or add one if this is the first time.
  perl -pi -e 's{(href="css/[^"?]+\.css)(\?v=\d+)?"}{$1?v='"$V"'"}g;
               s{(src="js/[^"?]+\.js)(\?v=\d+)?"}{$1?v='"$V"'"}g;' "$f"
done

echo "asset version -> $V"
grep -h -o 'v=[0-9]\{12\}' index.html | sort -u
