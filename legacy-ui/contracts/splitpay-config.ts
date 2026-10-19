/**
 * SplitPay contract configuration.
 *
 * AFTER DEPLOYMENT: replace SPLITPAY_ADDRESS with the deployed contract address.
 * The address is also recorded in contracts/contract-metadata/SplitPay.json
 * and in AGENTS.md after a successful deployment.
 *
 * To deploy: open the terminal in Arc Studio and run:
 *   bun run contracts:build   (rebuilds the contract)
 * Then ask Arc Studio to "deploy the SplitPay contract to Arc Testnet".
 */

// Deployed 2026-10-17 on ETH Sepolia via Arc Studio
// USDC constructor arg: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 (ETH Sepolia USDC, 6 decimals)
export const SPLITPAY_ADDRESS = '0x9692f54be2921ce00a02de9ee97bfb06469c6167' as `0x${string}`

/** Is the contract deployed and wired? */
export const CONTRACT_DEPLOYED = SPLITPAY_ADDRESS !== '0x0000000000000000000000000000000000000000'

export const SPLITPAY_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_usdcToken', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'splitPay',
    inputs: [
      { name: 'totalAmount', type: 'uint256' },
      {
        name: 'shares',
        type: 'tuple[]',
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'basisPoints', type: 'uint16' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'previewSplit',
    inputs: [
      { name: 'totalAmount', type: 'uint256' },
      {
        name: 'shares',
        type: 'tuple[]',
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'basisPoints', type: 'uint16' },
        ],
      },
    ],
    outputs: [
      { name: 'amounts', type: 'uint256[]' },
      { name: 'valid', type: 'bool' },
      { name: 'errorMsg', type: 'string' },
    ],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'usdcToken',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'BASIS_POINTS',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MAX_RECIPIENTS',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'MAX_TOTAL_AMOUNT',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'PaymentExecuted',
    inputs: [
      { name: 'payer', type: 'address', indexed: true },
      { name: 'totalAmount', type: 'uint256', indexed: false },
      { name: 'recipients', type: 'address[]', indexed: false },
      { name: 'amounts', type: 'uint256[]', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: true },
    ],
  },
  // rescueToken — recovers non-USDC tokens accidentally sent to the contract
  {
    type: 'function',
    name: 'rescueToken',
    inputs: [
      { name: 'token',  type: 'address' },
      { name: 'to',     type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Custom errors
  { type: 'error', name: 'CannotRescueUSDC', inputs: [] },
  { type: 'error', name: 'RescueZeroAmount', inputs: [] },
  { type: 'error', name: 'RescueToMustBeCaller', inputs: [] },
  { type: 'error', name: 'AmountTooLarge', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'TooFewRecipients', inputs: [] },
  { type: 'error', name: 'TooManyRecipients', inputs: [{ name: 'got', type: 'uint256' }, { name: 'max', type: 'uint256' }] },
  { type: 'error', name: 'ZeroAddressRecipient', inputs: [{ name: 'index', type: 'uint256' }] },
  { type: 'error', name: 'ZeroShareBasisPoints', inputs: [{ name: 'index', type: 'uint256' }] },
  { type: 'error', name: 'DuplicateRecipient', inputs: [{ name: 'recipient', type: 'address' }] },
  { type: 'error', name: 'InvalidTotalBasisPoints', inputs: [{ name: 'got', type: 'uint256' }, { name: 'expected', type: 'uint256' }] },
  { type: 'error', name: 'DistributionError', inputs: [] },
] as const
