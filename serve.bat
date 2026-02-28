@echo off
echo Starting local server at http://localhost:3000
start "" "http://localhost:3000/index.html"
npx serve . --listen 3000
