@echo off
echo ===========================================
echo   Starting Auto-QA-Reporter (Local Dev)
echo ===========================================

:: Start the API Server in a new window
echo Starting API Server...
start "API Server" cmd /c "cd /d %~dp0 && pnpm --filter @workspace/api-server run dev"

:: Start the QA Inspector UI in a new window
echo Starting Frontend (QA Inspector)...
start "QA Inspector UI" cmd /c "cd /d %~dp0 && pnpm --filter @workspace/qa-inspector run dev"

echo.
echo Both servers are starting in separate windows.
echo - API Server usually runs on http://localhost:3001
echo - QA Inspector UI usually runs on http://localhost:5173 
echo.
pause
