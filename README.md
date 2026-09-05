# PrivateSignal — Chainlink Runtime Environment (CRE) Workflow

A decentralized workflow built for the **Chainlink Runtime Environment (CRE)** that ingests, verifies, and reaches BFT consensus on private off-chain market/risk signals, compiling directly to WebAssembly (WASM) for execution across a Decentralized Oracle Network (DON).

---

## Architecture Overview

```
privatesignal/
├── .env                          # Environment variables & secrets (git-ignored)
├── .gitignore                    # Build, environment, and secrets exclusions
├── project.yaml                  # CRE target configurations & RPC network maps
├── secrets.yaml                  # CRE DON secret mappings
├── agent_skills_config.json      # Inter-agent skill discovery
├── package.json                  # Root workspace package configuration
├── tsconfig.json                 # Bundler target TypeScript configuration (ES2022, strict)
├── src/                          # Confidential Core & Graph Integration
│   ├── api/                      # Product API & Query Audit Storage
│   │   ├── server.ts             # Express API server (/api/score, /api/history, /api/agent/status)
│   │   └── db.ts                 # SQLite metadata persistence (zero secrets stored)
│   ├── graph/                    # Multi-protocol Graph robustness & MCP integration
│   │   ├── queries.ts            # Introspected multi-protocol queries & live endpoints
│   │   ├── schemaMapper.ts       # Protocol schema normalizer (Messari Lending -> Canonical)
│   │   ├── nlRouter.ts           # Natural language prompt router -> Graph MCP tool call
│   │   └── aggregator.ts         # Live data aggregator, 30s TTL cache, & feature extractor
│   ├── handlers/
│   │   └── confidentialScorer.ts # TEE WASM confidential risk scoring handler
│   ├── utils/
│   │   ├── pureMath.ts           # Pure-math normalization & deterministic hashing (no node/browser globals)
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
│   │   └── privacy/page.tsx      # TEE security boundary & data classification diagram
│   └── src/components/           # ScoreGauge, RecommendationBadge, AttestationCard, PrivacyDiagram
├── tests/
│   ├── confidentialScorer.test.ts# Confidential core unit tests & privacy boundary verification
│   ├── graphRobustness.test.ts   # Graph queries, schema mapper, router, & aggregator tests
│   ├── apiServer.test.ts         # Express API endpoints & attestation verification test suite
│   └── privatesignal.test.ts     # CRE workflow configuration & payload test suite
└── privatesignal/                # CRE Workflow Module
    ├── main.ts                   # Workflow entrypoint with CRE Runner
    ├── workflow.ts               # Workflow logic, triggers, & capabilities
    └── workflow.yaml             # Workflow target settings
```

---

## Key Capabilities & Features

1. **Confidential Core TEE Scorer (`src/handlers/confidentialScorer.ts`)**:
   - Compiles to WebAssembly via QuickJS under strict zero-leak constraints.
   - Zero dependencies on Node.js built-ins (`fs`, `crypto`, `http`) or browser globals (`fetch`).
   - Retrieves private policy profiles and scoring weights from Chainlink Vault DON secrets via `cre.capabilities.Secrets`.
   - Computes cross-protocol risk features (LTV, collateral concentration, health pressure) using pure math.
   - Strictly enforces the privacy boundary: private weights and intermediate math stay sealed inside the enclave, returning only the final score (0–100), recommendation, reason codes, and an attestation envelope.

2. **Multi-Protocol Graph Robustness Layer (`src/graph/`)**:
   - **Introspected Queries**: Queries live decentralized network subgraphs for Aave V3 (`JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`) and Morpho Blue (`8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs`) following the Messari Lending schema standard.
   - **Schema Normalizer**: Unifies protocol positions, handles missing prices with reliable fallbacks, and computes unified health factors.
   - **Natural Language & MCP Router**: Translates natural language prompts and structured JSON into standard `execute_graph_query` Graph MCP tool calls.
   - **Live Aggregator & Cache**: Assembles multi-protocol positions, extracts cross-protocol risk features (concentration, debt, health pressure, and liquid staking derivative exposure), and caches results with a 30-second TTL.

3. **Product Query API & SQLite Audit Store (`src/api/`)**:
   - **Express Server**: Exposes `POST /api/score`, `GET /api/history`, `GET /api/history/:queryId`, `GET /api/agent/status`, and `GET /api/health`.
   - **Rate Limiting**: Sliding window rate limiting of 10 req/min per IP.
   - **Redacted Logging**: All logs redact private weights and calculations, outputting only public audit receipts.
   - **Metadata Persistence**: SQLite database records query timestamps, addresses, scores, and DON IDs without storing proprietary weights.

4. **Attestation Verification Helper (`src/utils/verifyAttestation.ts`)**:
   - Validates cryptographic execution digests and signatures from Chainlink CRE DON enclaves.
   - Formats human-readable verification summaries for frontend display and judge inspection.

5. **Next.js Full Product Web Interface (`frontend/`)**:
   - **`/query`**: Natural language prompt input and structured multi-protocol configuration console.
   - **`/result/[queryId]`**: Dynamic score report with `ScoreGauge`, `RecommendationBadge`, and `AttestationCard`.
   - **`/agent`**: Circle agent wallet on Arc testnet (Circle L1) showing native USDC balance and score-gated triggers.
   - **`/privacy`**: Interactive architectural map and data classification matrix comparing TEE enclave isolation against operator view.

6. **BFT Consensus & DON Workflow Deployment**:
   - Compiles deterministic WASM and registers workflow directly on Chainlink CRE production DON.

---

## Quickstart & Commands

### 1. Install Dependencies

```bash
bun install
cd frontend && bun install && cd ..
```

### 2. Run Test Suite & Typecheck

```bash
bun test
bun run typecheck
```

### 3. Run Backend API Server

```bash
bun run api
```

### 4. Run Next.js Frontend

```bash
bun run dev:frontend
```

### 5. Deploy Workflow to Production DON

```bash
bun run deploy:workflow
```
