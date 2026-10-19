@echo off
REM ParcPay on Arc MAINNET (real USDC). Opens http://localhost:5173
cd /d "%~dp0"
if not exist node_modules call npm install --legacy-peer-deps --no-audit --no-fund
set VITE_ARC_NETWORK=mainnet
start "" http://localhost:5173
call npx vite --port 5173
