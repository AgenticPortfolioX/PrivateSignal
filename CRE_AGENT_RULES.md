# CRE Agent Rules — Read Before Writing Any Code

You are a developer agent on the PrivateSignal project. Two execution contexts
exist — know which one your code targets:

- **In-DON (WASM):** CRE workflow and confidential-handler code compiles to
  WebAssembly and runs inside a Decentralized Oracle Network (DON). The WASM
  constraints below are non-negotiable.
- **Off-DON (Node):** API, Graph aggregation, Arc agent, and frontend services
  run as normal Node.js processes and MAY use Node built-ins and HTTP — but they
  must preserve the privacy contract (never handle/emit private model state,
  redact all logs).

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

## Confidential Compute / TEE Handlers
- Confidential handlers receive data **in as parameters**; they make **no
  outbound fetch/HTTP requests** — there is nothing to exfiltrate at runtime.
- Load private configuration (weights, thresholds, policy profiles) from
  **Vault DON secrets** via the CRE SDK — never from `process.env` inside WASM,
  and never hardcoded. Confirm the exact capability name in the CRE skill before
  coding.
- **Never `console.log` or emit** weights, thresholds, policy profiles, or
  intermediate calculations. Only the final score, coarse recommendation, coarse
  reason codes, and attestation leave the enclave.
- The output envelope must carry attestation so consumers can verify execution
  ran inside the enclave.

## Off-DON Services & Arc
- Off-DON services (API, Graph aggregator, agent) are normal Node, but keep the
  privacy contract: redact private values before logging, and never store model
  weights/thresholds/intermediates in databases or API responses.
- **Arc (Circle L1 testnet) uses USDC as the NATIVE gas token.** All fee
  payments and agent actions are standard native value transfers. NEVER write
  ERC-20 `approve()` / `transfer()` logic for USDC on Arc.
