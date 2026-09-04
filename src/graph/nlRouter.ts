/**
 * PrivateSignal — Graph MCP / Natural Language Query Router
 *
 * ============================================================================
 * MCP ROUTER SPECIFICATION:
 * Translates freeform natural language prompts and structured JSON inputs into
 * deterministic Graph MCP tool invocations targeting `execute_graph_query`.
 *
 * Supported Prompts:
 * - "Score cross-protocol risk for wallet 0x123... across Aave and Morpho under conservative policy"
 * - "Is concentration in ETH-correlated collateral too high for cautious agent 0x456...?"
 * - "Check health factor and liquidation safety for 0x789... on Aave V3"
 * ============================================================================
 */

import {
  SUPPORTED_PROTOCOLS,
  type SupportedProtocol,
  isSupportedProtocol,
  buildProtocolQuery,
  getSubgraphEndpoint,
  UNIFIED_MESSARI_POSITIONS_QUERY,
} from './queries'

export type QuestionType = 'risk_score' | 'concentration_check' | 'health_factor' | 'general_query'

export interface StructuredQueryInput {
  walletAddress?: string
  protocols?: string[]
  policyProfileId?: string
  questionType?: QuestionType
}

export interface McpToolCall {
  tool: 'execute_graph_query'
  arguments: {
    query: string
    variables: Record<string, any>
    endpoint: string
    protocol: SupportedProtocol
  }
}

export interface QueryPlan {
  walletAddress: string
  protocols: SupportedProtocol[]
  policyProfileId: string
  questionType: QuestionType
  variables: {
    walletAddress: string
  }
  mcpToolCall: McpToolCall
  multiProtocolToolCalls: McpToolCall[]
  timestamp: number
}

const ETH_ADDRESS_REGEX = /0x[a-fA-F0-9]{40}/

export function isValidEthereumAddress(address: string): boolean {
  return ETH_ADDRESS_REGEX.test(address) && address.length === 42
}

/**
 * Parses freeform natural language prompt or structured JSON into a standardized Graph QueryPlan
 */
export function routeToGraphQueryPlan(input: string | StructuredQueryInput): QueryPlan {
  let rawText = typeof input === 'string' ? input : ''
  let structured: StructuredQueryInput = typeof input === 'object' ? input : {}

  // 1. Extract & Validate Wallet Address
  let walletAddress = structured.walletAddress || ''
  if (!walletAddress && rawText) {
    const match = rawText.match(ETH_ADDRESS_REGEX)
    if (match) {
      walletAddress = match[0]
    }
  }

  if (!walletAddress) {
    throw new Error('INVALID_ROUTER_INPUT: No valid Ethereum wallet address found in query (expected 0x... 40 hex chars)')
  }

  if (!isValidEthereumAddress(walletAddress)) {
    throw new Error(`INVALID_ETHEREUM_ADDRESS: '${walletAddress}' is not a valid 42-character Ethereum address`)
  }

  const normalizedWallet = walletAddress.toLowerCase()

  // 2. Extract & Validate Protocols
  const protocols: SupportedProtocol[] = []
  if (structured.protocols && Array.isArray(structured.protocols) && structured.protocols.length > 0) {
    for (const p of structured.protocols) {
      const lower = p.toLowerCase() as SupportedProtocol
      if (!isSupportedProtocol(lower)) {
        throw new Error(`UNSUPPORTED_PROTOCOL: Protocol '${p}' is not supported. Available: ${SUPPORTED_PROTOCOLS.join(', ')}`)
      }
      if (!protocols.includes(lower)) protocols.push(lower)
    }
  } else if (rawText) {
    const lowerText = rawText.toLowerCase()
    if (lowerText.includes('aave')) protocols.push('aave-v3')
    if (lowerText.includes('morpho')) protocols.push('morpho')
  }

  // Default to all supported protocols if none specified
  if (protocols.length === 0) {
    protocols.push('aave-v3', 'morpho')
  }

  // 3. Extract Policy Profile Style
  let policyProfileId = structured.policyProfileId || ''
  if (!policyProfileId && rawText) {
    const lowerText = rawText.toLowerCase()
    if (lowerText.includes('conservative') || lowerText.includes('cautious') || lowerText.includes('defensive')) {
      policyProfileId = 'conservative'
    } else if (lowerText.includes('aggressive') || lowerText.includes('yield') || lowerText.includes('degen')) {
      policyProfileId = 'aggressive'
    } else {
      policyProfileId = 'balanced'
    }
  }
  if (!policyProfileId) {
    policyProfileId = 'balanced'
  }

  // 4. Extract Question Type
  let questionType: QuestionType = structured.questionType || 'general_query'
  if (structured.questionType) {
    questionType = structured.questionType
  } else if (rawText) {
    const lowerText = rawText.toLowerCase()
    if (lowerText.includes('concentration') || lowerText.includes('correlated') || lowerText.includes('derivative')) {
      questionType = 'concentration_check'
    } else if (lowerText.includes('health') || lowerText.includes('pressure') || lowerText.includes('liquidation')) {
      questionType = 'health_factor'
    } else if (lowerText.includes('score') || lowerText.includes('risk') || lowerText.includes('cross-protocol')) {
      questionType = 'risk_score'
    }
  }

  // 5. Build MCP Tool Calls
  const multiProtocolToolCalls: McpToolCall[] = protocols.map((proto) => {
    const queryInfo = buildProtocolQuery(proto, normalizedWallet)
    return {
      tool: 'execute_graph_query',
      arguments: {
        query: queryInfo.query,
        variables: queryInfo.variables,
        endpoint: queryInfo.endpoint,
        protocol: proto,
      },
    }
  })

  const primaryToolCall = multiProtocolToolCalls[0]

  return {
    walletAddress: normalizedWallet,
    protocols,
    policyProfileId,
    questionType,
    variables: {
      walletAddress: normalizedWallet,
    },
    mcpToolCall: primaryToolCall,
    multiProtocolToolCalls,
    timestamp: Math.floor(Date.now() / 1000),
  }
}
