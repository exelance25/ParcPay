// Cross-check: viem's EIP-712 digest for a ParcPay Order must equal ParcPay.hashOrder().
// Usage: VIEM_DIGEST=$(node scripts/eip712-vector.mjs) forge test --match-test DigestMatchesViem
import { hashTypedData } from 'viem'
const types = {
  Transfer: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  Order: [
    { name: 'payer', type: 'address' }, { name: 'transfers', type: 'Transfer[]' },
    { name: 'maxFee', type: 'uint256' }, { name: 'start', type: 'uint64' },
    { name: 'interval', type: 'uint64' }, { name: 'runs', type: 'uint32' },
    { name: 'expiry', type: 'uint64' }, { name: 'nonce', type: 'uint256' }, { name: 'memo', type: 'bytes32' },
  ],
}
process.stdout.write(hashTypedData({
  domain: { name: 'ParcPay', version: '2', chainId: 5042, verifyingContract: '0x00000000000000000000000000000000000aBCdE' },
  types, primaryType: 'Order',
  message: {
    payer: '0x1111111111111111111111111111111111111111',
    transfers: [
      { to: '0x2222222222222222222222222222222222222222', amount: 1_500_000n },
      { to: '0x3333333333333333333333333333333333333333', amount: 2_500_000n },
    ],
    maxFee: 1000n, start: 1_800_000_000n, interval: 2_592_000n, runs: 12, expiry: 1_900_000_000n, nonce: 42n,
    memo: '0x7061790000000000000000000000000000000000000000000000000000000000',
  },
}))
