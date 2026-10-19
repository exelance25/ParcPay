# ParcPay — deterministic deploy through the CREATE2 deployer (same address on Arc Testnet & Mainnet).
#
# One-time: import your deployer key into an encrypted Foundry keystore (never paste keys on the CLI):
#   cast wallet import parcpay-deployer --interactive
#
# Usage (PowerShell, from the project folder):
#   .\deploy\deploy.ps1 -Network testnet
#   .\deploy\deploy.ps1 -Network mainnet      # moves REAL USDC for gas — double-check first
param([ValidateSet('testnet','mainnet')][string]$Network = 'testnet', [string]$Account = 'parcpay-deployer')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rpc = if ($Network -eq 'mainnet') { 'https://rpc.mainnet.arc.io' } else { 'https://rpc.testnet.arc.io' }
$factory = '0x4e59b44847b379578588920cA78FbF26c0B4956C'
$salt = (Get-Content "$root\salt.txt" -Raw).Trim()
$init = (Get-Content "$root\ParcPay.initcode.hex" -Raw).Trim() -replace '^0x',''
$expected = (Get-Content "$root\address.txt" -Raw).Trim()

$hash = (cast keccak "0x$init").Trim()
if ($hash -ne '0xe11bdc1f339944e7044cfa3508957709a822e451b54bcebc3156d7adf326ad81') { throw "Init code hash mismatch: $hash" }
$predicted = (cast create2 --deployer $factory --salt $salt --init-code-hash $hash).Trim()
Write-Host "Network : $Network ($rpc)"
Write-Host "Address : $predicted"
if ($predicted -ne $expected) { throw "Predicted address $predicted != expected $expected" }

$code = (cast code $predicted --rpc-url $rpc).Trim()
if ($code -ne '0x') { Write-Host 'Already deployed on this network.'; exit 0 }
if ((cast code $factory --rpc-url $rpc).Trim() -eq '0x') { throw 'CREATE2 deployer not found on this network.' }

if ($Network -eq 'mainnet') {
  $ok = Read-Host 'Deploy to Arc MAINNET (real USDC gas)? Type YES'
  if ($ok -ne 'YES') { exit 1 }
}
cast send $factory "$salt$init" --rpc-url $rpc --account $Account
Write-Host 'Checking…'
cast call $predicted 'treasury()(address)' --rpc-url $rpc
cast call $predicted 'fee()(uint256)' --rpc-url $rpc
cast call $predicted 'owner()(address)' --rpc-url $rpc
Write-Host "Done: $predicted"
