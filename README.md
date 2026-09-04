# PrivateSignal — Chainlink Runtime Environment (CRE) Workflow

A decentralized workflow built for the **Chainlink Runtime Environment (CRE)** that ingests, verifies, and reaches BFT consensus on private off-chain market/risk signals, compiling directly to WebAssembly (WASM) for execution across a Decentralized Oracle Network (DON).

---

## Architecture Overview

```
privatesignal/
├── .env                          # Local environment variables & RPC endpoints
├── .env.example                  # Sanitized environment template
├── .gitignore                    # Artifacts & secrets exclusions
├── project.yaml                  # CRE target configurations & RPC network maps
├── secrets.yaml                  # CRE DON secret mappings
├── agent_skills_config.json      # Inter-agent skill discovery (all 7 Chainlink skills)
├── gemini.md                     # Antigravity worker agent guidelines
├── CLAUDE.md                     # Claude Code workspace guidelines & rules
├── CRE_AGENT_RULES.md            # Non-negotiable WASM determinism & security rules
├── package.json                  # Root workspace package configuration
├── contracts/
│   ├── IPrivateSignalReceiver.sol # On-chain receiver contract interface
│   └── abi/
│       └── PrivateSignalReceiver.json # Receiver contract ABI
├── tests/
│   └── privatesignal.test.ts     # Configuration & execution test suite
└── privatesignal/                # Core CRE Workflow Package
    ├── main.ts                   # Workflow entrypoint with CRE Runner
    ├── workflow.ts               # Workflow logic, triggers, & capabilities
    ├── workflow.yaml             # Workflow target settings
    ├── package.json              # TypeScript dependencies (@chainlink/cre-sdk, viem, zod)
    ├── tsconfig.json             # Bundler target TypeScript configuration
    ├── config.local.json         # Local simulation parameters
    ├── config.staging.json       # Sepolia testnet parameters
    └── config.production.json    # Production parameters
```

---

## Key Capabilities & Features

1. **Deterministic Execution (QuickJS/WASM)**:
   - Zero dependencies on Node.js built-ins (`fs`, `crypto`, `http`, etc.) or browser globals.
   - Deterministic DON timestamps via `runtime.now()`.
   - Pure JS / TypedArray Base64 encoding compatible with QuickJS.

2. **BFT Consensus on External Signals**:
   - Nodes query off-chain signal endpoints independently.
   - Aggregate external values using `consensusMedianAggregation` for deterministic agreement across the DON.

3. **On-Chain Receiver Integration**:
   - Formats and encodes calldata using `viem` to invoke `onSignalUpdate(bytes32,uint256,int256,uint256,bytes)`.

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

### 3. Run CRE Simulation

Simulate locally via the CRE CLI:

```bash
cre workflow simulate privatesignal --target local-simulation
```

Or target staging:

```bash
cre workflow simulate privatesignal --target staging-settings
```

---

## Environment Variables

Copy `.env.example` to `.env` and populate your RPC endpoints and secrets:

```bash
cp .env.example .env
```
