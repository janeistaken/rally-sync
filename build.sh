#!/bin/sh
set -e
cd "$(dirname "$0")"
npx --yes terser src/app.js -c -m -o app.min.js
npx --yes clean-css-cli -o app.min.css src/app.css
echo "Built app.min.js and app.min.css"
