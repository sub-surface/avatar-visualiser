@echo off
echo Starting local server at http://localhost:3000
echo Open: http://localhost:3000/index.html
echo Tests: http://localhost:3000/tests.html
start /b cmd /c "timeout /t 2 >nul && start http://localhost:3000/index.html"
npx serve . --listen 3000
