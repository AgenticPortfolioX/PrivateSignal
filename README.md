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
├── src/                          # Confidential Core Module
│   ├── handlers/
│   │   └── confidentialScorer.ts # TEE WASM confidential risk scoring handler
│   ├── utils/
│   │   └── pureMath.ts           # Pure-math normalization & deterministic hashing (no node/browser globals)
│   ├── types/
│   │   └── scorer.ts             # Data models: QueryParams, Secrets, ScoreOutput, PolicyProfile
│   ├── config/
│   │   └── policyConfig.ts       # Baseline policy profiles & DON threshold defaults
│   └── deploy/
│       └── createWorkflow.ts     # CRE production DON deployment & verification script
├── tests/
│   ├── confidentialScorer.test.ts# Confidential core unit tests & privacy boundary verification
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

2. **BFT Consensus on External Signals**:
   - DON nodes query risk parameters and normalize graph feeds independently.
   - Deterministic aggregation ensures BFT consensus across oracle nodes.

3. **Production DON Deployment (`src/deploy/createWorkflow.ts`)**:
   - Automates workflow registration and secret provisioning to Chainlink CRE DON.
   - Includes real execution verification with cryptographic attestation receipts.

---

## Quickstart & Simulation

### 1. Install Dependencies

```bash
bun install
```

### 2. Run Typecheck & Tests

```bash
bun test
bun run typecheck
```

### 3. Deploy Workflow to Production DON

```bash
bun run deploy:workflow
```
