# PrivateSignal

> **We run a private cross-protocol risk model inside a Chainlink TEE on live standardized Graph data, and only a signed score leaves the enclave so agents on Arc can pay for and act on confidential risk intelligence without leaking strategy.**

[![Tests](https://img.shields.io/badge/tests-39%20passing-10b981.svg)](#13-test-suites--verification)
[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE%20Confidential-375bd2.svg)](https://chain.link)
[![The Graph](https://img.shields.io/badge/The%20Graph-MCP%20%26%20Subgraphs-6b21a8.svg)](https://thegraph.com)
[![Arc Testnet](https://img.shields.io/badge/Arc%20Network-Native%20USDC-059669.svg)](https://arc.network)

---

## 1. Problem: Why Confidentiality in DeFi Risk Scoring Matters

Modern DeFi institutions and autonomous agents face an impossible dilemma when managing on-chain risk across protocols:

- **Alpha & Strategy Leakage**: Publishing a risk scoring algorithm or mathematical threshold on a public blockchain exposes proprietary risk models, risk matrices, and alpha to competitors and adversarial MEV bots.
- **Predatory Front-Running & Liquidation Hunting**: If an oracle publicly broadcasts that a portfolio or vault is nearing a distress threshold, searchers front-run rebalancing transactions, trigger cascades, or manipulate collateral markets to force liquidations.
- **Cross-Protocol Blind Spots**: Risk is fragmented across protocols (e.g., Aave V3, Morpho Blue). Computing cross-protocol leverage, collateral concentration (e.g. liquid staking derivative exposure), and health pressure requires aggregating real-time data across subgraphs without revealing which strategies are being monitored.

---

## 2. Solution Overview

**PrivateSignal** solves this by establishing an attested, confidential pipeline:

1. **Decentralized Graph Ingestion**: Ingests multi-protocol positions across Aave V3 and Morpho Blue using standardized Messari Lending subgraphs and Graph MCP routing.
2. **Confidential TEE Enclave Execution**: Evaluates risk inside a Chainlink Runtime Environment (CRE) Trusted Execution Environment (TEE) compiled to QuickJS WebAssembly (WASM).
3. **Sealed Proprietary Secrets**: Private policy weights, threshold matrices, and model coefficients are securely injected from Chainlink Vault DON secrets via `cre.capabilities.Secrets`—never visible to the node operator or the public.
4. **Cryptographic Attestation**: Emits only a BFT-signed attestation envelope containing the public score (0–100), coarse recommendation (`safe`, `caution`, `high_risk`), and proof hash.
5. **Arc Agent Loop & Native USDC Economy**: Autonomous agents on Arc Testnet (Circle L1) sponsor score evaluations using **native USDC** (zero ERC-20 overhead) and enforce score-gated risk mitigation actions.

---

## 3. Project Description

**PrivateSignal** is an institutional-grade confidential risk intelligence infrastructure engineered for autonomous on-chain finance. As decentralized capital markets scale across multiple lending protocols, institutional credit delegates, hedge funds, DAOs, and autonomous AI agents require continuous, verifiable risk assessment to safeguard collateral and execute policy-driven capital allocation. However, public oracles force risk managers to either expose their proprietary mathematical models on-chain or resort to unaudited, centralized off-chain servers.

PrivateSignal harmonizes three foundational Web3 technologies into a single unified workflow:
- **The Graph Protocol**: Provides standardized, decentralized indexing across major lending protocols (Aave V3 and Morpho Blue) using canonical schemas and natural language Model Context Protocol (MCP) routing.
- **Chainlink Runtime Environment (CRE) & Hardware Enclaves (TEE)**: Executes the confidential risk scoring core inside a tamper-proof hardware enclave compiled to deterministic QuickJS WebAssembly. Proprietary model weights and policy cutoffs are loaded directly from the Chainlink Vault DON—enabling high-conviction risk analysis without exposing internal intellectual property or trading alpha.
- **Arc Network (Circle L1)**: Operates an autonomous agent loop with a native USDC gas model where agents sponsor confidential score queries and execute hard score-gated risk mitigation actions (capital deployment, leverage trimming) with zero ERC-20 token overhead and zero ETH gas dependencies.

By sealing proprietary models within the enclave and egressing only cryptographically signed verdicts, PrivateSignal delivers institutional trust, zero alpha leakage, and verifiable policy enforcement for the next generation of autonomous on-chain agents.

---

## 4. Architecture Diagram

[![PrivateSignal CRE Confidential Architecture](docs/architecture.svg)](docs/architecture.svg)

> *Click diagram to open full-resolution SVG: [docs/architecture.svg](docs/architecture.svg)*

```
privatesignal/
├── .env                          # Environment variables & keys (git-ignored)
├── project.yaml                  # CRE target configurations & RPC network maps
├── secrets.yaml                  # CRE DON secret mappings
├── agent_skills_config.json      # Inter-agent skill discovery
├── package.json                  # Root workspace package configuration
├── tsconfig.json                 # Strict TypeScript configuration
├── docs/
│   └── architecture.svg          # High-resolution architectural diagram
├── src/                          # Confidential Core & Graph Integration
│   ├── api/                      # Product API & Query Audit Storage
│   │   ├── server.ts             # Express API (/api/score, /api/agent/run, /api/agent/status)
│   │   └── db.ts                 # SQLite metadata persistence (zero secrets stored)
│   ├── arc/                      # Arc Testnet (Circle L1) Autonomous Agent Loop
│   │   ├── agentWallet.ts        # Native USDC payment service & gas balance monitor
│   │   ├── gatedAction.ts        # Hard score-gated risk mitigation action executor
│   │   └── agentLoop.ts          # Closed-loop autonomous agent controller & telemetry
│   ├── demo/
│   │   └── runDemo.ts            # Interactive demo narration & public verification runner
│   ├── graph/                    # Multi-protocol Graph robustness & MCP integration
│   │   ├── queries.ts            # Introspected multi-protocol queries & live endpoints
│   │   ├── schemaMapper.ts       # Protocol schema normalizer (Messari Lending -> Canonical)
│   │   ├── nlRouter.ts           # Natural language prompt router -> Graph MCP tool call
│   │   └── aggregator.ts         # Live data aggregator, 30s TTL cache, & feature extractor
│   ├── handlers/
│   │   └── confidentialScorer.ts # TEE WASM confidential risk scoring handler
│   ├── utils/
│   │   ├── pureMath.ts           # Pure-math normalization & deterministic hashing
│   │   └── verifyAttestation.ts  # Chainlink CRE attestation verification & display helper
│   ├── types/
│   │   └── scorer.ts             # Data models: QueryParams, Secrets, ScoreOutput, PolicyProfile
│   ├── config/
│   │   └── policyConfig.ts       # Baseline policy profiles & DON threshold defaults
│   └── deploy/
│       └── createWorkflow.ts     # CRE production DON deployment & verification script
├── frontend/                     # Next.js Full Product Web Interface
│   ├── src/app/
│   │   ├── query/page.tsx        # Natural language & structured risk query console
│   │   ├── result/[queryId]/     # Permanent score verdict & attestation audit receipt
│   │   ├── agent/page.tsx        # Arc testnet (Circle L1) native USDC agent panel
│   │   └── privacy/page.tsx      # TEE security boundary & data classification matrix
│   └── src/components/           # ScoreGauge, RecommendationBadge, AttestationCard, PrivacyDiagram
├── tests/
│   ├── confidentialScorer.test.ts# Confidential core unit tests & privacy boundary verification
│   ├── graphRobustness.test.ts   # Graph queries, schema mapper, router, & aggregator tests
│   ├── apiServer.test.ts         # Express API endpoints & attestation verification test suite
│   ├── arcAgentLoop.test.ts      # Arc testnet balance, gated action allow/deny, & loop telemetry
│   └── privatesignal.test.ts     # CRE workflow configuration & payload test suite
└── privatesignal/                # CRE Workflow Module
    ├── main.ts                   # Workflow entrypoint with CRE Runner
    ├── workflow.ts               # Workflow logic, triggers, & capabilities
    └── workflow.yaml             # Workflow target settings
```

---

## 5. Privacy Boundary: What Stays Sealed vs Leaves the Enclave

| Security Zone | Data Element | Description |
| :--- | :--- | :--- |
| **Inside TEE Enclave (Private)** | Strategy Weights ($\alpha, \beta, \gamma$) | Model coefficients for LTV, concentration, and health pressure |
| **Inside TEE Enclave (Private)** | Policy Threshold Matrices | Confidential risk cutoffs for conservative vs aggressive profiles |
| **Inside TEE Enclave (Private)** | Intermediate Calculations | Mathematical polynomials, raw penalties, cross-asset correlations |
| **Inside TEE Enclave (Private)** | Enclave Signing Keys | Keys used to produce BFT attestation digest |
| **Leaves TEE Enclave (Attested)** | Final Risk Score (0–100) | Public risk metric (e.g. `84.5 / 100`) |
| **Leaves TEE Enclave (Attested)** | Recommendation | Coarse action verdict (`safe`, `caution`, `high_risk`) |
| **Leaves TEE Enclave (Attested)** | Reason Codes | Sanitized, high-level flags (`LOW_HEALTH_FACTOR`, `HIGH_CONCENTRATION`) |
| **Leaves TEE Enclave (Attested)** | Cryptographic Attestation | Execution hash and DON signature verifying enclave provenance |
| **Public On-Chain** | Normalized Graph Data | Publicly visible on-chain collateral and debt positions |
| **Public On-Chain** | Arc Native Transactions | Query micropayments (0.10 USDC) and score-gated action transfers |

---

## 6. Sponsor Integration Details

### Chainlink: CRE Confidential Workflow & Vault DON Secrets
- **Confidential Scorer Handler** (`src/handlers/confidentialScorer.ts`): Compiles to WebAssembly via QuickJS under strict zero-leak constraints. Operates with zero Node.js built-ins (`fs`, `crypto`, `http`) and zero browser globals (`fetch`).
- **Chainlink Vault DON Secrets**: Injected inside the enclave boundary using `cre.capabilities.Secrets`. Proprietary scoring parameters never touch the host machine or host logs.
- **Cryptographic Attestation Verification** (`src/utils/verifyAttestation.ts`): BFT consensus proof verifying that computation ran unaltered in an authentic enclave.

### The Graph: Standardized Subgraphs & MCP Integration
- **Decentralized Network Subgraphs** (`src/graph/queries.ts`): Connects to live decentralized network subgraphs for Aave V3 (`JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`) and Morpho Blue (`8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs`).
- **Messari Lending Schema Mapping** (`src/graph/schemaMapper.ts`): Normalizes diverse lending protocols into unified position structures with safe fallback price resolution.
- **Natural Language & MCP Router** (`src/graph/nlRouter.ts`): Maps free-form prompts (e.g., *"Score cross-protocol risk for wallet 0x1111... across Aave and Morpho"*) into standardized `execute_graph_query` Graph MCP tool calls.
- **Live Feature Aggregator** (`src/graph/aggregator.ts`): Assembles positions, calculates collateral concentration and liquid staking derivative exposure (wstETH, cbETH), and caches data with a 30-second TTL.

### Arc: Native USDC Gas & Score-Gated Agent Loop
- **Circle L1 Native USDC Model** (`src/arc/agentWallet.ts`): Arc Testnet (`chainId: 5042002`) uses USDC as the **native gas currency** (18 decimals). All payments use native EVM transactions (`value: parseEther(...)`), eliminating ERC-20 `approve()` and contract execution overhead.
- **Micropayment Sponsorship**: Autonomous 0.10 native USDC query fee payments with real-time balance tracking and low-balance warnings (< 1.0 USDC).
- **Hard Score-Gated Action Execution** (`src/arc/gatedAction.ts`): Strictly blocks capital deployment if the attested score is below the required policy threshold (e.g. $\ge 65$ for safe allocation, $\ge 80$ for yield strategy).
- **Closed-Loop Controller** (`src/arc/agentLoop.ts`): 5-step autonomous cycle with full step telemetry.

---

## 7. Getting Started

### Prerequisites
- [Bun](https://bun.sh) (v1.1+ recommended) or Node.js (v20+)
- The Graph API Key (Gateway access)
- Chainlink CRE CLI (`@chainlink/cre-sdk`)
- Arc Testnet account funded with native USDC (Circle L1)

### 1. Installation
```bash
# Install root dependencies
bun install

# Install frontend dependencies
cd frontend && bun install && cd ..
```

### 2. Environment Configuration
Create a `.env` file in the project root with the following parameters:
```bash
# Network & RPC Settings
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
ARC_AGENT_WALLET_ADDRESS=0xfb79f82a690b91ab86c2299de4e7ecc228f61269
ARC_FEE_AMOUNT_USDC=0.10
AGENT_PRIVATE_KEY=your_private_key_here

# Chainlink CRE Confidential Core
CRE_TARGET=private
CRE_DON_ID=don-zone-a-production
VAULT_SECRET_SLOT=slot_privatesignal_weights_v1

# The Graph Integration
graph_api_key=your_graph_api_key_here
GRAPH_API_ENDPOINT=https://gateway.thegraph.com/api/your_graph_api_key/subgraphs/id
```

### 3. Running the Test Suite & Typecheck
```bash
# Run all 39 unit and integration tests
bun test

# Validate strict TypeScript compilation
bun run typecheck
```

### 4. Running the Backend API Server
```bash
# Starts Express product API on port 3001
bun run api
```

### 5. Running the Next.js Frontend
```bash
# Starts Next.js app on port 3000
bun run dev:frontend
```

### 6. Deploying the CRE Workflow to Production DON
```bash
# Compiles WASM and deploys workflow to Chainlink CRE
bun run deploy:workflow
```

---

## 8. Demo Guide

### Running the Interactive Narration Script
```bash
# Interactive mode (pauses for Enter key at each step for live narration)
bun run demo

# Automated CI mode
bun run demo --auto
```

### Demonstration Scenarios

#### Scenario 1: Approved Action (Healthy Portfolio)
- **Prompt**: `"Score cross-protocol risk for wallet 0x1111111111111111111111111111111111111111 across Aave and Morpho under conservative policy"`
- **Target Policy**: Conservative (Threshold: $\ge 65$)
- **Execution**:
  - Graph aggregates live multi-protocol positions.
  - TEE enclave scores positions and outputs attested score: `100 / 100` (`SAFE`).
  - Arc Agent sponsors 0.10 native USDC query fee.
  - Policy gate evaluates `100 >= 65` $\rightarrow$ **PERMITTED**.
  - Agent executes native USDC transfer of 0.20 USDC to the safe allocation pool on Arc Testnet.
  - Transaction hash emitted in public audit receipt.

#### Scenario 2: Blocked Action (Overleveraged Portfolio)
- **Prompt**: `"Score cross-protocol risk for wallet 0x2222222222222222222222222222222222222222 across Aave and Morpho under aggressive policy"`
- **Target Policy**: Aggressive Yield Strategy (Threshold: $\ge 80$)
- **Execution**:
  - TEE enclave evaluates high leverage and outputs score: `42 / 100` (`HIGH_RISK`).
  - Policy gate evaluates `42 < 80` $\rightarrow$ **STRICT ABORT**.
  - Output: `BLOCKED_BY_RISK_POLICY: Attested score (42) is below required policy threshold (80) for Aggressive Yield Strategy Injection. Action aborted.`
  - **Zero funds dispatched on Arc**, preserving 100% of capital.

---

## 9. What's Live vs Mocked

| Component | Status | Implementation Details |
| :--- | :--- | :--- |
| **The Graph Subgraph Queries** | **LIVE** | Introspected queries to live decentralized network subgraphs on Arbitrum/Mainnet |
| **Chainlink CRE Execution** | **LIVE** | Pure-math QuickJS WASM handler compatible with Chainlink CRE enclaves |
| **Arc Testnet RPC & Balance** | **LIVE** | Live JSON-RPC queries to `https://rpc.testnet.arc.network` verifying 20.00 native USDC |
| **Arc USDC Gas Micropayments** | **LIVE** | Native EVM transfers sending 18-decimal native USDC |
| **Attestation Verification** | **LIVE** | Cryptographic SHA-256 execution digest validation |
| **Offline Fallback** | **OPTIONAL** | Local dry-run fallback flag provided for continuous CI and testing |

---

## 10. Judge Verification Guide

### For Chainlink Judges
- **Confidential TEE Scorer**: [`src/handlers/confidentialScorer.ts`](src/handlers/confidentialScorer.ts)
  - Inspect zero-leak constraints: no Node.js built-ins (`fs`, `crypto`, `http`) or browser globals (`fetch`).
  - Pure-math normalization and deterministic hashing: [`src/utils/pureMath.ts`](src/utils/pureMath.ts).
- **Vault DON Secrets Mapping**: [`secrets.yaml`](secrets.yaml) and [`src/config/policyConfig.ts`](src/config/policyConfig.ts).
- **Attestation Verification Helper**: [`src/utils/verifyAttestation.ts`](src/utils/verifyAttestation.ts).
- **CRE Workflow Deployment**: [`privatesignal/workflow.ts`](privatesignal/workflow.ts) and [`src/deploy/createWorkflow.ts`](src/deploy/createWorkflow.ts).

### For The Graph Judges
- **Standardized Subgraph Queries**: [`src/graph/queries.ts`](src/graph/queries.ts)
  - Introspected queries matching Messari Lending schema standard for Aave V3 and Morpho Blue.
- **Protocol Schema Mapper**: [`src/graph/schemaMapper.ts`](src/graph/schemaMapper.ts)
  - Normalized collateral, debt, unified health factors, and safe pricing fallbacks.
- **Natural Language & Graph MCP Router**: [`src/graph/nlRouter.ts`](src/graph/nlRouter.ts)
  - Free-form intent translation to `execute_graph_query` MCP tool calls.
- **Multi-Protocol Aggregator**: [`src/graph/aggregator.ts`](src/graph/aggregator.ts).

### For Arc Judges
- **Native USDC Gas Model**: [`src/arc/agentWallet.ts`](src/arc/agentWallet.ts)
  - Arc Testnet chain definition (`chainId: 5042002`) with native currency `USDC` (18 decimals).
  - Native transactions via `value: parseEther(...)` without ERC-20 `approve()` or `transfer()` calls.
  - Live balance verification on Circle Agent wallet `0xfb79f82a690b91ab86c2299de4e7ecc228f61269`.
- **Score-Gated Action Execution**: [`src/arc/gatedAction.ts`](src/arc/gatedAction.ts).
- **Autonomous Agent Loop**: [`src/arc/agentLoop.ts`](src/arc/agentLoop.ts).

---

## 11. Why This Isn't a Template Liquidation Bot

PrivateSignal is **not** an MEV bot, arbitrage bot, or automated liquidation script:

1. **Confidential Risk Intelligence as a Service**: PrivateSignal provides privacy-preserving cross-protocol health scoring without revealing proprietary risk formulas.
2. **Policy Gating, Not Liquidation**: The agent loop evaluates whether capital allocation or yield strategy injection should proceed. It does not liquidate third-party borrowers or close distressed positions.
3. **Institutional Enclave Architecture**: Tailored for credit delegates, DAOs, hedge funds, and autonomous treasury managers who require verifiable risk assessment without broadcasting their internal risk appetite.

---

## 12. Security & Privacy Considerations

- **No Secrets in Logs**: Sanitized audit logger (`src/api/server.ts`) redacts all private weights, thresholds, and intermediate math.
- **Zero-Storage Privacy Contract**: SQLite database (`src/api/db.ts`) stores only public query metadata (timestamps, wallet addresses, final score, attestation hash).
- **Rate Limiting**: Sliding window rate limiting of 10 requests per minute per IP.
- **Cryptographic Attestation Verification**: Every score receipt is verified against the DON execution digest before triggering downstream actions.

---

## 13. Test Suites & Verification

PrivateSignal maintains **100% test pass rate** across 39 tests:

```bash
bun test
```

```
✓ tests/confidentialScorer.test.ts   (5 tests)  - Pure-math scoring, privacy boundary, attestation
✓ tests/graphRobustness.test.ts      (11 tests) - Subgraph queries, schema mapping, NL router, aggregator
✓ tests/apiServer.test.ts            (11 tests) - API endpoints, SQLite persistence, rate limiting
✓ tests/arcAgentLoop.test.ts         (7 tests)  - Live Arc RPC balance, allow/deny gating, agent loop
✓ tests/privatesignal.test.ts        (5 tests)  - CRE workflow configuration, Base64 roundtrip, calldata

Total: 39 pass, 0 fail (171 expect assertions)
```
