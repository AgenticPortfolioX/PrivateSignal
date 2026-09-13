# PrivateSignal

> **Private risk intelligence for on-chain agents.**  
> Public Graph data in → private CRE scoring → public score out → Arc treasury funding released or blocked.

[![Tests](https://img.shields.io/badge/tests-124%20passing-10b981.svg)](#tests)
[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE%20Confidential-375bd2.svg)](https://chain.link)
[![The Graph](https://img.shields.io/badge/The%20Graph-MCP%20%26%20Subgraphs-6b21a8.svg)](https://thegraph.com)
[![Arc Testnet](https://img.shields.io/badge/Arc%20Network-Native%20USDC-059669.svg)](https://arc.network)

---

## Why this exists

DeFi risk is public. **Risk strategy is not supposed to be.**

Positions, health factors, and collateral compositions are already visible on-chain. The valuable part is the *evaluation policy*:

- Which signals matter
- How they are weighted
- What thresholds trigger caution vs refusal
- How cross-protocol concentration is penalized

If that policy is public, it stops being an edge. Competitors copy it. Searchers anticipate it. Agents that depend on it leak intent before they move capital.

Most teams solve this by hiding the model on a centralized server. That restores secrecy and destroys verifiability.

**PrivateSignal is the missing middle:**

- **Public multi-protocol state** from The Graph
- **Private scoring** inside a Chainlink CRE Trusted Execution Environment (TEE)
- **Only a public verdict** leaves the enclave
- **Arc treasury funding is released or blocked** by the confidential score — native USDC, no ERC-20 overhead

This is not a liquidation bot. It is **confidential decision infrastructure**.

---

## The core insight (especially for Chainlink)

Confidential Workflows are wasted when they only hide an API key or a boolean flag.

PrivateSignal hides the **decision model itself**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      INSIDE THE ENCLAVE (SEALED)                        │
│  • Proprietary scoring weights (LTV, correlation, concentration)        │
│  • Private threshold matrices                                           │
│  • Intermediate penalties and cross-protocol feature math               │
│  • Policy profile behavior                                              │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │  Confidential Output
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     OUTSIDE THE ENCLAVE (EMITTED)                       │
│  • Final score (0–100)                                                  │
│  • Coarse recommendation (safe / caution / high_risk)                   │
│  • Sanitized reason codes (HEALTH_FACTOR_OPTIMAL, LTV_WITHIN_LIMITS)      │
│  • Honest non-claiming envelope (verified: false)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**That boundary is the product.**

- If the TEE is removed, PrivateSignal has no durable edge.  
- If the model is public, the strategy is already compromised.

This is exactly the class of problem CRE Confidential Workflows are for: **privacy-preserving risk assessment and policy enforcement**, where sensitive parameters and intermediate computation must remain sealed while the application still receives a usable, public result.

---

## What PrivateSignal does

1. **Ingest live risk state** from standardized Graph subgraphs across protocols (Aave V3 and Morpho Blue).
2. **Route natural-language intent** through Graph MCP into structured multi-protocol queries.
3. **Score privately** inside a Chainlink CRE confidential handler using sealed model weights and policy thresholds from Vault DON secrets.
4. **Emit only a public verdict** from the confidential workflow.
5. **Gate an Arc treasury action** — on the allow path, native USDC is released; on the deny path, zero capital moves.

> **Public data in. Private reasoning sealed. Public decision out. Capital movement gated.**

---

## Why it is important

Autonomous agents are starting to allocate, rebalance, and sponsor actions on-chain. They need continuous risk judgment, but they cannot afford to publish the policy that makes that judgment valuable.

Without confidential compute, teams are forced into one of three failures:

1. **Publish the model** and lose alpha  
2. **Centralize the model** and lose verifiability  
3. **Skip policy entirely** and over-expose capital  

PrivateSignal makes a fourth path real:

> **Agents can consume a private risk policy via a confidential-executed service.**

That matters for treasuries, credit delegates, agentic allocators, and any system that needs **policy enforcement without policy disclosure**.

---

## Why it is unique

Most hackathon projects in this space do one of the following:

- Reskin a liquidation / rebalancing template
- Build an agent marketplace with payments
- Wrap subgraph chat around public data
- Hide credentials while leaving the decision logic public

PrivateSignal does something narrower and harder to dismiss. Oasis or Phala can host generic confidential compute, but this product thesis is **composability for agentic risk decisions across The Graph + Chainlink CRE + Circle Arc**.

- The secret is the **scoring model**, not just credentials
- The data path is **standardized multi-protocol Graph ingestion**, not one ad-hoc subgraph
- The output is a **public decision artifact from a confidential workflow**, not a dashboard opinion
- Arc is not a tip jar; the score is a **binding gate** on agent action

Remove any one of those and the product collapses into something generic. Keep all four and it becomes infrastructure.

---

## Architecture Visual

[![PrivateSignal CRE Confidential Architecture](docs/architecture.svg)](docs/architecture.svg)

> *Click diagram to open full-resolution SVG: [docs/architecture.svg](docs/architecture.svg)*

---

## Why the confidential CRE portion is the load-bearing piece

### What CRE confidential execution gives us

Chainlink CRE lets sensitive workflow logic run inside a hardware-isolated TEE (Trusted Execution Environment) compiled to QuickJS WebAssembly (WASM).

In PrivateSignal that means:

- **Zero Memory Leaks**: Model coefficients never sit in app logs, client bundles, or operator-visible memory paths.
- **Dynamic Policy Profiles**: Threshold matrices differ between conservative, balanced, and aggressive profiles without exposing the threshold boundaries.
- **Sealed Intermediate Math**: Concentration penalties, cross-protocol pressure terms, and liquid staking correlation factors remain sealed inside the enclave.
- **Verifiable Output**: The downstream application receives a deterministic score it can trust was executed confidentially.

### What we deliberately keep out of the enclave output

We do **not** return:

- Algorithmic weights
- Raw feature vectors
- Private threshold cutoffs
- Full internal mathematical traces

We return only what a downstream agent needs to act:

- **Score** (normalized 0–100 integer)
- **Recommendation** (`safe` / `caution` / `high_risk`)
- **Coarse reason codes** (`HEALTH_FACTOR_OPTIMAL`, `LTV_WITHIN_LIMITS`, `HIGH_CONCENTRATION`)
- **Attestation envelope** (`verified: false`, `LOCAL_PROTOTYPE_MODE` signature)

### Why this is more than “we used a TEE”

> A TEE that encrypts an API key is a secure config loader.  
> A TEE that runs the proprietary risk function is a **confidential decision engine**.

PrivateSignal is the second one.

That is also why this is robust for the Chainlink Confidential Workflow track:

- The confidential handler is **required** for a valid score
- Secrets from Vault DON are **part of core scoring**, not optional garnish
- The rest of the product **depends on the output**
- Judges can inspect a clear privacy boundary instead of trusting marketing language

---

## Solution architecture at a glance

```text
User / Agent Prompt
        │
        ▼
Natural Language / Graph MCP Routing
        │
        ▼
Standardized Multi-Protocol Graph Queries
(Aave V3 + Morpho Blue, shared Messari schema pattern)
        │
        ▼
Feature Aggregation
(cross-protocol exposure, concentration, health pressure)
        │
        ▼
Chainlink CRE Confidential Workflow (TEE)
  ├─ Load sealed weights / thresholds from Vault DON
  ├─ Compute private score in QuickJS WASM enclave
  └─ Emit public verdict only (score, recommendation, reason codes)
        │
        ▼
Arc Agent Loop (Circle L1)

  ├─ Evaluate policy gate against threshold
  ├─ ALLOW: Dispatch capital / rebalance position
  └─ DENY: Strictly block action and preserve capital
```

### Privacy Boundary Breakdown

| Security Zone | Elements | Description |
| :--- | :--- | :--- |
| **Sealed Inside TEE** | Strategy weights, policy threshold matrices, intermediate calculations, enclave signing material | Never leaves hardware enclave; completely inaccessible to node operator and public |
| **Allowed to Leave** | Final score (0–100), recommendation, sanitized reason codes, honest non-claiming attestation envelope | Public verdict with zero proprietary state leakage |
| **Public by Nature** | On-chain positions indexed by The Graph and action transactions | Visible on Ethereum and Arc public ledgers |

---

## Sponsor Fit

### 1. Chainlink CRE Confidential Workflows
**Why we are eligible for the bounty**: PrivateSignal uses the Chainlink Runtime Environment (CRE) Confidential Workflows to execute proprietary scoring algorithms inside a hardware-isolated Trusted Execution Environment (TEE). It securely loads sealed risk model weights from the Vault DON and computes a cross-protocol risk score in WebAssembly (WASM) without ever exposing the internal model logic to the public.

**Key Code Usage**:
- [src/handlers/confidentialScorer.ts#L262-L402](https://github.com/AgenticPortfolioX/PrivateSignal/blob/main/src/handlers/confidentialScorer.ts#L262-L402) - *The core confidential risk evaluation math running inside the CRE TEE.*
- [privatesignal/workflow.yaml](https://github.com/AgenticPortfolioX/PrivateSignal/blob/main/privatesignal/workflow.yaml) - *The CRE workflow deployment configuration.*

PrivateSignal uses confidential execution as the product core:
- **Confidential Scorer Handler**: Compiled for enclave constraints (`src/handlers/confidentialScorer.ts`), operating without Node.js built-ins (`fs`, `crypto`, `http`) or browser globals.
- **Vault DON Secrets**: Injected sealed model and policy parameters via `cre.capabilities.Secrets` (`secrets.yaml`).
- **Verdict**: Consumed by the application and agent loop.
- **Honest Prototype Path**: The interactive demo routes through the identical codebase via a local harness (`LOCAL_PROTOTYPE_MODE`); deployed private-registry CRE evidence is documented separately in `docs/deployment-evidence.md`.

*This maps directly to privacy-preserving risk assessment and policy enforcement.*

### 2. The Graph
**Why we are eligible for the bounty**: PrivateSignal ingests live, standardized cross-protocol risk state from Aave V3 and Morpho Blue using decentralized network subgraphs. It features a novel Graph Model Context Protocol (MCP) router that translates natural-language AI prompts directly into structured, multi-protocol subgraph queries.

**Key Code Usage**:
- [src/graph/nlRouter.ts#L30-L75](https://github.com/AgenticPortfolioX/PrivateSignal/blob/main/src/graph/nlRouter.ts#L30-L75) - *The Graph MCP Tool Router for natural language mapping.*
- [src/graph/queries.ts](https://github.com/AgenticPortfolioX/PrivateSignal/blob/main/src/graph/queries.ts) - *Direct GraphQL queries interfacing with the decentralized network.*

PrivateSignal does not merely “query a subgraph”:
- **Decentralized Network Subgraphs**: Connects to live subgraphs for Aave V3 (`JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`) and Morpho Blue (`8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs`).
- **Standardized Schema Normalization**: Maps diverse lending models to canonical `UnifiedAccountData` through `src/graph/schemaMapper.ts`.
- **Graph MCP Natural Language Router**: Real entry point translating user/agent prompts into structured `execute_graph_query` tool calls (`src/graph/nlRouter.ts`).
- **Cross-Protocol Feature Aggregator**: Aggregates multi-protocol positions, calculating aggregate LTV and staking derivative concentration (`src/graph/aggregator.ts`).

*Standards leverage is visible: one pattern across protocols, not custom one-off glue.*

### 3. Arc
**Why we are eligible for the bounty**: PrivateSignal uses Arc Testnet as its treasury execution layer, where a confidential CRE score is the sole gate on native USDC capital releases. On the allow path, USDC moves; on the deny path, zero capital moves — no ERC-20 `approve`/`transfer` overhead in either case.

**Key Code Usage**:
- [src/arc/gatedAction.ts#L340-L389](https://github.com/AgenticPortfolioX/PrivateSignal/blob/main/src/arc/gatedAction.ts#L340-L389) - *Viem executing the score-gated native USDC capital transfer on Arc Testnet.*
- [src/arc/agentWallet.ts](https://github.com/AgenticPortfolioX/PrivateSignal/blob/main/src/arc/agentWallet.ts) - *Arc Testnet connection and Viem configuration.*

PrivateSignal uses Arc as the agent execution environment:
- **Native USDC Gas Model**: Operates on Arc Testnet (`chainId: 5042002`) where USDC is the native gas currency with 18 decimals (zero ERC-20 `approve`/`transfer` calls).
- **Score-Gated Capital Release**: The confidential score is the sole decision signal — above threshold triggers `FUNDING_RELEASED`; below threshold triggers `FUNDING_BLOCKED` with zero capital moved.
- **Hard Score Gating**: Policy threshold enforced in `src/arc/gatedAction.ts` before any on-chain action executes.
- **First-Class Outcomes**: Both the allow path (USDC released) and deny path (0 USDC moved) are fully tested and proven.

*Arc is where confidential intelligence becomes capital policy.*

---

## Project Layout

```text
privatesignal/
├── src/
│   ├── api/            # Express product API and redacted query audit storage (SQLite)
│   ├── arc/            # Arc Testnet native USDC payments and score-gated agent actions
│   ├── config/         # Policy profiles and sealed parameter defaults
│   ├── deploy/         # CRE production DON deployment helpers
│   ├── graph/          # Multi-protocol queries, schema mapping, NL/MCP routing, aggregator
│   ├── handlers/       # Confidential TEE scoring handler (QuickJS WASM)
│   ├── types/          # Strict TypeScript interfaces (scorer, Graph, attestation)
│   └── utils/          # Pure math + attestation verification helpers
├── frontend/           # Next.js UI: Query console, result receipt, agent panel, privacy explorer
├── tests/              # 50 unit, mock, and end-to-end integration tests
│   └── fixtures/       # Standardized Messari lending & normalized portfolio test fixtures
├── docs/
│   ├── architecture.svg # High-resolution architecture visual diagram
│   ├── architecture.md  # Detailed architecture documentation
│   └── demo-script.md   # 5-minute judge demonstration script with exact timestamps
└── privatesignal/      # CRE workflow module (main.ts, workflow.ts, workflow.yaml)
```

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) (v1.1+) or Node.js (v20+)
- The Graph API key
- Chainlink CRE access / CLI (`@chainlink/cre-sdk`)
- Arc testnet wallet funded with native USDC

### Installation
```bash
# Install root dependencies
bun install

# Install frontend dependencies
cd frontend && bun install && cd ..
```

### Environment Configuration
Create a `.env` file in the root workspace:
```bash
# Chainlink CRE
CRE_TARGET=private
CRE_DON_ID=don-zone-a-production
VAULT_SECRET_SLOT=slot_privatesignal_weights_v1

# The Graph
GRAPH_API_KEY=your_graph_api_key_here
GRAPH_API_ENDPOINT=https://gateway.thegraph.com/api/your_graph_api_key/subgraphs/id

# Arc Network (Circle L1)
ARC_RPC_URL=https://rpc.testnet.arc.circle.com
ARC_CHAIN_ID=5042
ARC_AGENT_WALLET_ADDRESS=0xfb79f82a690b91ab86c2299de4e7ecc228f61269

AGENT_PRIVATE_KEY=your_private_key_here
```

### Running Tests
```bash
bun test

# Validate strict TypeScript compilation
bun run typecheck
```

### Running the Application
```bash
# Terminal 1: Start Express backend API (port 3001)
bun run api

# Terminal 2: Start Next.js frontend UI (port 3000)
bun run dev:frontend

# Terminal 3: Run interactive demo narration
bun run demo
```

### Deploying the CRE Workflow
```bash
# Compiles WASM and deploys workflow to Chainlink CRE DON
bun run deploy:workflow
```

---

## Demo Scenarios

### Scenario 1 — Allowed Action (Healthy Portfolio)
- **Prompt**: `"Score cross-protocol risk for wallet 0x1111111111111111111111111111111111111111 across Aave and Morpho under conservative policy"`
- **Execution Flow**:
  1. Graph aggregates live multi-protocol positions across Aave V3 and Morpho.
  2. CRE confidential workflow evaluates portfolio and emits public score: `100 / 100` (`SAFE`).
  3. Arc agent evaluates policy gate.
  4. Policy gate evaluates `100 >= 65` → **PERMITTED**.
  5. Agent executes `FUNDING_RELEASED` on Arc: 0.20 native USDC transferred (tx hash logged live by agent loop).
  6. Public receipt records the action with zero leaked strategy weights.

### Scenario 2 — Blocked Action (Overleveraged Portfolio)
- **Prompt**: `"Score cross-protocol risk for wallet 0x2222222222222222222222222222222222222222 across Aave and Morpho under aggressive policy"`
- **Execution Flow**:
  1. Graph aggregates positions revealing high aggregate LTV and low health factor.
  2. CRE confidential workflow detects high leverage and concentration, emitting score: `55 / 100` (`UNSAFE`).
  3. Arc agent evaluates policy gate.
  4. Policy gate evaluates `55 < 80` → **REJECTED** (`FUNDING_BLOCKED`).
  5. **Zero capital is dispatched on Arc**, completely protecting the treasury.
  6. Public receipt logs the refusal reason without leaking model internals.

> **These two paths matter. A score that cannot block action is not policy. A score that cannot allow action is not useful.**

---

## What is Live vs Optional

| Component | Status | Notes |
| :--- | :--- | :--- |
| **Graph Subgraph Queries** | **LIVE** | Introspected queries to live decentralized network subgraphs (Aave V3 & Morpho) |
| **CRE Confidential Scoring Path** | **LIVE** | Deployed to private staging registry (see Real CRE Deployment Evidence below); interactive demo routes through identical local codebase (`LOCAL_PROTOTYPE_MODE`) |
| **Arc RPC & Balances** | **LIVE** | Live JSON-RPC queries to Arc Testnet (`https://rpc.testnet.arc.circle.com`) |
| **Gated Actions** | **LIVE** | Native USDC value transfers (18 decimals), both allow and deny paths |
| **Attestation Verification** | **OPTIONAL** | App-level verification is explicit (`verified:false`) to reflect honest envelope |
| **Offline Fallback** | **OPTIONAL** | Mock fixtures provided for local CI / dry runs without external RPC dependencies |

*The judged demo path uses live Graph data, deployed confidential workflow evidence, and real Arc allow/deny behavior.*

---

## Judge Verification Map

### 1. Chainlink CRE
- **Confidential Handler**: [`src/handlers/confidentialScorer.ts`](src/handlers/confidentialScorer.ts)
- **Pure Math / Deterministic Helpers**: [`src/utils/pureMath.ts`](src/utils/pureMath.ts)
- **Secrets Mapping**: [`secrets.yaml`](secrets.yaml), [`src/config/policyConfig.ts`](src/config/policyConfig.ts)
- **Attestation Helper**: [`src/utils/verifyAttestation.ts`](src/utils/verifyAttestation.ts)
- **Workflow & Deployment**: [`privatesignal/workflow.ts`](privatesignal/workflow.ts), [`src/deploy/createWorkflow.ts`](src/deploy/createWorkflow.ts)

*What to look for: Scoring happens in the confidential path, secrets influence the result, only the public summary leaves, and agent behavior depends on that result.*

### 2. The Graph
- **Standardized Queries**: [`src/graph/queries.ts`](src/graph/queries.ts)
- **Schema Normalizer**: [`src/graph/schemaMapper.ts`](src/graph/schemaMapper.ts)
- **NL / MCP Router**: [`src/graph/nlRouter.ts`](src/graph/nlRouter.ts)
- **Feature Aggregator**: [`src/graph/aggregator.ts`](src/graph/aggregator.ts)

*What to look for: Shared standardized pattern across protocols, live data ingestion, natural language MCP as a real entry point, and cross-protocol features driving the score.*

### 3. Arc
- **Wallet & Native USDC**: [`src/arc/agentWallet.ts`](src/arc/agentWallet.ts)
- **Score-Gated Capital Release**: [`src/arc/gatedAction.ts`](src/arc/gatedAction.ts)
- **Autonomous Agent Loop**: [`src/arc/agentLoop.ts`](src/arc/agentLoop.ts)

*What to look for: hard threshold enforcement and first-class FUNDING_RELEASED / FUNDING_BLOCKED outcomes with native USDC.*

---

## What This is Not

PrivateSignal is **not**:
- An MEV searcher or arbitrage bot
- A liquidation bot
- A public risk dashboard with marketing copy
- A centralized model API with no attestation
- A payments demo with a fake risk score

> It is **confidential risk intelligence infrastructure** with an agent-facing enforcement loop.

---

## Security and Privacy Posture

- **No Secret Leakage**: Zero private weights, feature vectors, or thresholds in client responses or server logs.
- **Sanitized Audit Storage**: SQLite database stores only redacted public metadata (query ID, timestamp, wallet address, score).
- **Envelope Honesty**: The system acknowledges a simulated/local envelope explicitly (`verified:false`) to reflect honest local processing.
- **Rate Limiting**: Sliding window rate limiting on all public API endpoints.

> **The security claim is precise: we protect proprietary evaluation of public state; we do not pretend public chain data is private.**

---

## Real CRE Deployment Evidence

The true CRE execution is demonstrated via an independent deployed staging workflow on a private registry:

- **Workflow Name:** `privatesignal-staging`
- **Production Workflow ID:** `00cd6793e74ece8644e7700732e4e4f2649b315f4227a61f67de5598723356f3`
- **Registry:** `private` *(Note: private registry executions do not produce on-chain txHashes)*
- **Success Execution ID:** `99fcf049-d4db-49cf-bcda-898136718145` (Score 100/100 SAFE)
- **Fail-Closed Execution ID:** `98725025-1acb-43c0-bb33-2f10913765d2` (GRAPH_DATA_UNAVAILABLE)

*Note: The interactive application (API/Agent loop) scores using the identical codebase via a local harness (`LOCAL_PROTOTYPE_MODE`), while the above execution IDs prove the true DON capabilities.*

---

## Deployment Evidence & Judge Verification Dossier

For complete transaction receipts, contract addresses, RPC endpoints, and consecutive validation logs, review the official dossier:
- **Deployment Evidence**: [`docs/deployment-evidence.md`](docs/deployment-evidence.md)
- **Demo Narration Script**: [`docs/demo-script.md`](docs/demo-script.md)
- **Architecture Visual**: [`docs/architecture.svg`](docs/architecture.svg)

---

## Tests

Run the complete test suite:
```bash
bun test
```

```
✓ tests/testing3.test.ts   (124 tests) - Full integrated suite covering confidential scoring,
                                         Graph robustness, API endpoints, Arc agent loop,
                                         end-to-end policy gating, and CRE workflow

Total: 124 pass, 0 fail
```

---

## License

MIT License — see [LICENSE](LICENSE) for full terms.

---

## Ownership

**PrivateSignal** is designed, built, and owned by **Justin Gramke**.

All source code, architecture, and documentation in this repository are the original work of Justin Gramke, submitted as an individual entrant to ETHGlobal Online 2026.

The `AgenticPortfolioX` GitHub organization is operated by Justin Gramke on his own behalf.

> Copyright © 2026 Justin Gramke. All rights reserved.
