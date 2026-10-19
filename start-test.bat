@echo off
REM ParcPay — local test on Arc Testnet. Double-click to run, then open http://localhost:5173
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install --legacy-peer-deps --no-audit --no-fund
)
set VITE_ARC_NETWORK=testnet
start "" http://localhost:5173
call npx vite --port 5173
