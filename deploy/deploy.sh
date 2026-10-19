#!/usr/bin/env bash
# Same as deploy.ps1 for macOS/Linux/Arc Studio terminal. Usage: ./deploy/deploy.sh testnet|mainnet [account]
set -euo pipefail
cd "$(dirname "$0")"
NET=${1:-testnet}; ACC=${2:-parcpay-deployer}
RPC=$([ "$NET" = mainnet ] && echo https://rpc.mainnet.arc.io || echo https://rpc.testnet.arc.io)
FACTORY=0x4e59b44847b379578588920cA78FbF26c0B4956C
SALT=$(tr -d ' \n\r' < salt.txt); INIT=$(tr -d ' \n\r' < ParcPay.initcode.hex); INIT=${INIT#0x}; EXPECTED=$(tr -d ' \n\r' < address.txt)
HASH=$(cast keccak 0x$INIT)
[ "$HASH" = 0xe11bdc1f339944e7044cfa3508957709a822e451b54bcebc3156d7adf326ad81 ] || { echo "init code hash mismatch $HASH"; exit 1; }
PRED=$(cast create2 --deployer $FACTORY --salt $SALT --init-code-hash $HASH)
echo "Network $NET  →  $PRED"; [ "$PRED" = "$EXPECTED" ] || { echo "address mismatch"; exit 1; }
[ "$(cast code $PRED --rpc-url $RPC)" != 0x ] && { echo "already deployed"; exit 0; }
if [ "$NET" = mainnet ]; then read -rp "Deploy to Arc MAINNET? type YES: " ok; [ "$ok" = YES ] || exit 1; fi
cast send $FACTORY "$SALT$INIT" --rpc-url $RPC --account $ACC
cast call $PRED 'treasury()(address)' --rpc-url $RPC; cast call $PRED 'fee()(uint256)' --rpc-url $RPC
