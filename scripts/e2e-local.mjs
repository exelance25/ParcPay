// End-to-end check on a local Anvil chain (chain id 5042002), using the same viem calls as the app.
// 1) USDC mock at 0x3600…0000  2) ParcPay via the canonical CREATE2 deployer + mined salt
// 3) approve → splitPay with fee  4) sign EIP-712 order → executeOrder by a third party
import { createTestClient, createWalletClient, createPublicClient, http, parseUnits, getContractAddress, concat, erc20Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import fs from 'node:fs'

const [saltArg] = process.argv.slice(2)
const RPC = 'http://127.0.0.1:8545'
const chain = { id: 5042002, name: 'local-arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }
const USDC = '0x3600000000000000000000000000000000000000'
const FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C'
const TREASURY = '0x9A5f2d1066D2a265EeB82baa7D6038Ca92469858'
const pay = JSON.parse(fs.readFileSync('contracts/out/ParcPay.sol/ParcPay.json'))
const mock = JSON.parse(fs.readFileSync('contracts/out/ParcPay.t.sol/MockUSDC.json'))
const init = '0x' + fs.readFileSync('deploy/ParcPay.initcode.hex', 'utf8').trim().replace(/^0x/, '')

// Anvil's PUBLIC default dev accounts (documented by Foundry, never funded on any real network).
const payerAcc = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
const keeperAcc = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) })
const pub = createPublicClient({ chain, transport: http(RPC) })
const payer = createWalletClient({ chain, account: payerAcc, transport: http(RPC) })
const keeper = createWalletClient({ chain, account: keeperAcc, transport: http(RPC) })
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } console.log('ok  ', m) }

// USDC mock at the Arc predeploy address
await test.setCode({ address: USDC, bytecode: mock.deployedBytecode.object })

// Deploy through CREATE2 factory
const salt = saltArg
const predicted = getContractAddress({ opcode: 'CREATE2', from: FACTORY, salt, bytecode: init })
const h0 = await payer.sendTransaction({ to: FACTORY, data: concat([salt, init]) })
await pub.waitForTransactionReceipt({ hash: h0 })
ok((await pub.getCode({ address: predicted }))?.length > 2, `ParcPay deployed at ${predicted}`)
const read = (functionName, args = []) => pub.readContract({ address: predicted, abi: pay.abi, functionName, args })
ok((await read('treasury')) === TREASURY, 'treasury = 0x9A5f…9858')
ok((await read('fee')) === 1000n, 'fee = 0.001 USDC')
ok((await read('owner')) === TREASURY, 'owner = treasury')

// Fund + approve + splitPay
await payer.writeContract({ address: USDC, abi: mock.abi, functionName: 'mint', args: [payerAcc.address, parseUnits('1000', 6)] })
const r1 = '0x1111111111111111111111111111111111111111', r2 = '0x2222222222222222222222222222222222222222'
const transfers = [{ to: r1, amount: parseUnits('12.5', 6) }, { to: r2, amount: parseUnits('7.5', 6) }]
let h = await payer.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [predicted, parseUnits('20.001', 6)] })
await pub.waitForTransactionReceipt({ hash: h })
const { request } = await pub.simulateContract({ account: payerAcc, address: predicted, abi: pay.abi, functionName: 'splitPay', args: [transfers, 1000n, '0x' + '00'.repeat(32)] })
h = await payer.writeContract(request)
const rc = await pub.waitForTransactionReceipt({ hash: h })
ok(rc.status === 'success', `splitPay tx ok (gas ${rc.gasUsed})`)
const bal = (a) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })
ok((await bal(r1)) === 12_500_000n && (await bal(r2)) === 7_500_000n, 'recipients got exact amounts')
ok((await bal(TREASURY)) === 1000n, 'treasury got 0.001 USDC')
ok((await bal(predicted)) === 0n, 'contract holds nothing')

// Signed order, executed by a third party
await payer.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [predicted, parseUnits('100', 6)] })
const now = BigInt((await pub.getBlock()).timestamp)
const order = { payer: payerAcc.address, transfers, maxFee: 1000n, start: now + 60n, interval: 86400n, runs: 2, expiry: now + 30n * 86400n, nonce: BigInt(Date.now()), memo: '0x' + Buffer.from('maas-ekim').toString('hex').padEnd(64, '0') }
const types = {
  Transfer: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  Order: [{ name: 'payer', type: 'address' }, { name: 'transfers', type: 'Transfer[]' }, { name: 'maxFee', type: 'uint256' }, { name: 'start', type: 'uint64' }, { name: 'interval', type: 'uint64' }, { name: 'runs', type: 'uint32' }, { name: 'expiry', type: 'uint64' }, { name: 'nonce', type: 'uint256' }, { name: 'memo', type: 'bytes32' }],
}
const sig = await payer.signTypedData({ domain: { name: 'ParcPay', version: '2', chainId: chain.id, verifyingContract: predicted }, types, primaryType: 'Order', message: order })
let early = false
try { await pub.simulateContract({ account: keeperAcc, address: predicted, abi: pay.abi, functionName: 'executeOrder', args: [order, sig] }) } catch (e) { early = /OrderNotDue/.test(e.message) }
ok(early, 'order rejected before start (OrderNotDue)')
await test.increaseTime({ seconds: 61 }); await test.mine({ blocks: 1 })
h = await keeper.writeContract({ address: predicted, abi: pay.abi, functionName: 'executeOrder', args: [order, sig] })
ok((await pub.waitForTransactionReceipt({ hash: h })).status === 'success', 'keeper executed run 1 with payer signature')
ok((await bal(r1)) === 25_000_000n, 'recipient 1 paid again by order')
const bad = { ...order, transfers: [{ to: keeperAcc.address, amount: transfers[0].amount }, transfers[1]] }
let tamper = false
try { await pub.simulateContract({ account: keeperAcc, address: predicted, abi: pay.abi, functionName: 'executeOrder', args: [bad, sig] }) } catch (e) { tamper = /InvalidSignature/.test(e.message) }
ok(tamper, 'tampered recipients rejected (InvalidSignature)')
console.log('E2E PASSED')
