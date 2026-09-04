# CRE Agent Rules — Read Before Writing Any Code

You are a developer agent writing a Chainlink CRE workflow in TypeScript.
Your code compiles directly to WebAssembly (WASM) and runs inside a Decentralized
Oracle Network (DON). These rules are non-negotiable.

## WASM Runtime Constraints
- **PROHIBITED**: Node.js built-ins (`fs`, `crypto`, `http`, `os`, `path`, `buffer`, etc.)
- **PROHIBITED**: Browser globals (`fetch`, `setTimeout`, `setInterval`, `localStorage`, `window`, etc.)
- **REQUIRED**: All interfaces and capabilities come exclusively from `@chainlink/cre-sdk`
- **Base64**: QuickJS does not include `btoa`/`atob` or Node `Buffer`. Use pure JS/Uint8Array or CRE SDK helpers.

## Determinism Rules
- Use `runtime.Now()` / `runtime.now()` for current timestamps — never `Date.now()`.
- Use `runtime.Rand()` for Go-side randomness.
- Use consensus aggregation for any external HTTP or node-mode data (`consensusMedianAggregation`, `consensusIdenticalAggregation`, `ConsensusAggregationByFields`).
- Use scaled integers or decimal strings for business-critical comparisons.
- Use `bigint` for Solidity integer values in TypeScript.

## Security Rules
- Secrets are references only — never hardcode private keys, API keys, or bearer tokens.
- Use the CRE SDK Vault or DON secret APIs for all credentials.

## Chainlink Agent Skills
Before writing any Chainlink integration code, load the relevant skill from:
`C:\Users\jmgra\antigravityagents\.agents\skills\chainlink-skills`

Available skills (see `agent_skills_config.json` for trigger keywords):
- `chainlink-cre-skill` — CRE workflows, CLI, SDK, triggers, simulation, deployment
- `chainlink-ccip-skill` — Cross-chain transfers and messaging
- `chainlink-data-feeds-skill` — On-chain price oracles
- `chainlink-data-streams-skill` — Low-latency streaming market data
- `chainlink-ace-skill` — Compliance engine, KYC/AML, policy enforcement
- `chainlink-vrf-skill` — Verifiable on-chain randomness
- `chainlink-confidential-ai-attester-skill` — Private TEE inference with attestation

## Simulation Before Deployment
ALWAYS simulate locally before any testnet deployment:
```bash
cre workflow simulate privatesignal --target local-simulation
```

Refuse to suggest or execute mainnet deployment operations.
