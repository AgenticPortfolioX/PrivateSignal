/**
 * @title Arc Wallet & Native USDC Payment Service
 * @author Justin Gramke
 * @notice Handles native USDC payments on Arc L1.
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



export function parseUsdcAmount(amount: number | string): bigint {
  return parseEther(amount.toString())
}

export function formatUsdcAmount(amountWei: bigint): string {
  return formatEther(amountWei)
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
    defaultAddress = '0x748ABdeF0775132E8F941e1513152D5eb02D3a4B'
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

