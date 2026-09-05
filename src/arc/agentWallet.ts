/**
 * PrivateSignal — Arc Wallet & Native USDC Payment Service
 *
 * ============================================================================
 * CRITICAL NETWORK CONSTRAINT:
 * Arc is a Circle L1 where USDC is the NATIVE gas token, not an ERC-20 contract.
 * - Standard native EVM transactions are used to transfer USDC.
 * - gasPrice and tx fees are paid in native USDC (18 decimals on Arc testnet).
 * - Absolutely DO NOT write ERC-20 approve() or transfer() calls for Arc gas or fees.
 * ============================================================================
 */

import 'dotenv/config'
import {
  defineChain,
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Hash,
  type TransactionReceipt,
  type WalletClient,
  type PublicClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network'],
    },
  },
})

// Default oracle fee recipient address (simulated treasury / DON gateway)
export const DEFAULT_ORACLE_FEE_RECIPIENT =
  process.env.ARC_ORACLE_FEE_RECIPIENT || '0x748ABdeF0775132E8F941e1513152D5eb02D3a4B'

export const DEFAULT_QUERY_FEE_USDC = parseFloat(process.env.ARC_FEE_AMOUNT_USDC || '0.10')

export function parseUsdcAmount(amount: number | string): bigint {
  return parseEther(amount.toString())
}

export function formatUsdcAmount(amountWei: bigint): string {
  return formatEther(amountWei)
}

export interface PaymentReceipt {
  txHash: Hash
  amountUSDC: number
  payer: string
  recipient: string
  blockNumber: string
  gasUsed: string
  status: 'SUCCESS' | 'REVERTED'
  timestamp: number
}

export interface ArcBalanceInfo {
  address: string
  balanceWei: bigint
  balanceUSDC: number
  balanceFormatted: string
  isLowBalance: boolean
  currency: 'USDC'
  decimals: 18
}

/**
 * Resolves the agent account from environment private keys
 */
export function getAgentAccount() {
  const rawKey =
    process.env.AGENT_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    process.env.CRE_ETH_PRIVATE_KEY

  if (!rawKey) {
    throw new Error('ARC_AGENT_ERROR: Missing AGENT_PRIVATE_KEY or PRIVATE_KEY in environment')
  }

  const cleanKey = rawKey.startsWith('0x') ? (rawKey as `0x${string}`) : (`0x${rawKey}` as `0x${string}`)
  return privateKeyToAccount(cleanKey)
}

/**
 * Returns configured public client connected to Arc testnet
 */
export function getArcPublicClient(): PublicClient {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(),
  })
}

/**
 * Returns configured wallet client initialized with the agent private key
 */
export function getArcWalletClient(): WalletClient {
  const account = getAgentAccount()
  return createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(),
  })
}

/**
 * Queries current native USDC balance on Arc testnet
 */
export async function getArcBalance(targetAddress?: string): Promise<ArcBalanceInfo> {
  const publicClient = getArcPublicClient()
  const configuredAddress = process.env.ARC_AGENT_WALLET_ADDRESS
  let defaultAddress: string
  try {
    const account = getAgentAccount()
    defaultAddress = account.address
  } catch {
    defaultAddress = '0xfb79f82a690b91ab86c2299de4e7ecc228f61269'
  }
  const address = targetAddress || configuredAddress || defaultAddress

  const balanceWei = await publicClient.getBalance({ address: address as `0x${string}` })
  const balanceUSDC = parseFloat(formatEther(balanceWei))

  return {
    address,
    balanceWei,
    balanceUSDC: Number(balanceUSDC.toFixed(4)),
    balanceFormatted: balanceUSDC.toFixed(2),
    isLowBalance: balanceUSDC < 1.0, // Alert if balance is below 1.0 USDC
    currency: 'USDC',
    decimals: 18,
  }
}

/**
 * Sends native USDC payment on Arc testnet for a confidential risk score
 */
export async function payForScore(
  amountUSDC: number = DEFAULT_QUERY_FEE_USDC,
  recipientAddress: string = DEFAULT_ORACLE_FEE_RECIPIENT,
): Promise<PaymentReceipt> {
  const publicClient = getArcPublicClient()
  const walletClient = getArcWalletClient()
  const account = getAgentAccount()

  // 1. Balance verification
  const { balanceUSDC } = await getArcBalance(account.address)
  if (balanceUSDC < amountUSDC) {
    throw new Error(
      `INSUFFICIENT_ARC_USDC: Agent balance (${balanceUSDC} USDC) is insufficient for query fee (${amountUSDC} USDC)`,
    )
  }

  // 2. Convert fee to native 18-decimal wei
  // On Arc, 1.00 USDC = 10^18 native units
  const valueWei = parseEther(amountUSDC.toString())

  // 3. Estimate gas
  const gasEstimate = await publicClient.estimateGas({
    account,
    to: recipientAddress as `0x${string}`,
    value: valueWei,
  }).catch(() => 21000n)

  // 4. Send native transaction (Zero ERC-20 approve/transfer calls)
  const txHash = await walletClient.sendTransaction({
    chain: arcTestnet,
    account,
    to: recipientAddress as `0x${string}`,
    value: valueWei,
    gas: (gasEstimate * 120n) / 100n, // 20% buffer
  })

  // 5. Wait for on-chain receipt
  const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  })

  return {
    txHash,
    amountUSDC,
    payer: account.address,
    recipient: recipientAddress,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status === 'success' ? 'SUCCESS' : 'REVERTED',
    timestamp: Math.floor(Date.now() / 1000),
  }
}
