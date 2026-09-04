# PrivateSignal — Build Plan

Seven-phase roadmap that turns the committed reference baseline into the full
PrivateSignal product described in [docs/architecture.md](./architecture.md).

> The detailed per-phase build prompts are maintained **locally** in the
> git-ignored `build/` folder and are deliberately **not** committed to this
> repository. This file is the public, high-level tracker.

## Baseline (committed & green)

- `privatesignal/` — reference CRE workflow package: cron trigger, off-chain
  signal fetch (median consensus), EVM calldata encoding. `typecheck` and
  `bun test` pass.

## Phase tracker

| # | Phase | Status | Primary deliverables |
|---|-------|--------|----------------------|
| 1 | **Confidential core** — CRE TEE handler + deployment | Pending | `src/handlers/confidentialScorer.ts`, `src/deploy/createWorkflow.ts`, Vault-DON secrets config, workflow + DON deployment evidence |
| 2 | **Graph robustness** — standardized queries + MCP/NL | Pending | `src/graph/queries.ts`, `src/graph/schemaMapper.ts`, `src/graph/nlRouter.ts`, `src/graph/aggregator.ts` |
| 3 | **Product API and UI** | Pending | `src/api/server.ts`, `src/utils/verifyAttestation.ts`, `/frontend` (Next.js) |
| 4 | **Arc agent loop** | Pending | `src/arc/agentWallet.ts`, `src/arc/gatedAction.ts`, `src/arc/agentLoop.ts` |
| 5 | **Submission polish** | Pending | `src/demo/runDemo.ts`, `docs/architecture.svg`, root `README.md` |
| 6 | **Testing and validation** | Pending | `/tests`, `docs/demo-script.md` |
| 7 | **End-to-end integration & final validation** | Pending | Live deployment evidence, security audit, submission package |

## Cross-cutting constraints (apply to every phase)

- **TEE handlers never fetch outbound and never emit private state** — data in
  as parameters, secrets from Vault DON, only the attested score leaves.
- **Arc payments/actions are native-USDC transactions** — never ERC-20
  `approve`/`transfer`.
- Off-DON Node services keep the privacy contract: redacted logging, no private
  weights/thresholds/intermediates in any public output or store.
- Simulation/verification before testnet deploys; no mainnet operations.
