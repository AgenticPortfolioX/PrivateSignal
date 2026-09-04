# Claude Code — Project Context: PrivateSignal

# CLAUDE.md — PrivateSignal (Chainlink CRE + The Graph + Arc)

PrivateSignal runs a **confidential cross-protocol risk-scoring** system: live,
standardized DeFi position data from The Graph feeds a Chainlink CRE TEE that
runs a private model and emits **only an attested score**; agents on Arc pay in
native USDC and are gated by that score. See `docs/architecture.md` for the
full product/architecture contract and `docs/build-plan.md` for the phased
roadmap.

This codebase has **two execution contexts**:
1. **Inside the DON (WASM)** — CRE workflows / confidential handlers compile to
   WASM and run in a Decentralized Oracle Network. Strict constraints below.
2. **Outside the DON (Node)** — off-chain services (`src/api`, Graph aggregator,
   `src/arc`, frontend) are normal Node.js processes that MAY use Node built-ins
   and HTTP — but they must still honor the privacy contract (below).

## Ownership
- Owner: **Justin Gramke** owns this codebase and all rights (see `OWNERS.md`).
  No license is granted. Do not publish or redistribute without the owner's consent.

## Hard Rules
- Inside-DON code (WASM): PROHIBITED Node.js built-ins (`fs`, `crypto`, `http`, `os`, `path`, `buffer`, etc.); PROHIBITED browser globals (`fetch`, `setTimeout`, `setInterval`, `localStorage`, etc.); REQUIRED `@chainlink/cre-sdk` for runtime interfaces; deterministic `runtime.now()`, not `Date.now()`.
- TEE confidential handlers: receive data **in as parameters** — **no outbound fetch/HTTP inside the handler**; load private config via Vault DON secrets (see the CRE skill for the exact API before coding); **never `console.log` or emit private weights, thresholds, policy profiles, or intermediate calculations** — only score / recommendation / reason codes / attestation leave the enclave.
- Arc (Circle L1 testnet): **USDC is the NATIVE gas token** — payments/actions are native value transfers, **never ERC-20 `approve`/`transfer`**.
- Logging & storage: redact all private values everywhere outside the TEE; store only query metadata, never private model state.
- Security: secrets are references only — never hardcode keys/tokens, and never commit `.env`.
- Before writing any Chainlink integration, load the relevant SKILL.md from the paths listed in `agent_skills_config.json`.
- ALWAYS run `cre workflow simulate privatesignal --target local-simulation` before any testnet deployment. A first real-DON confidential deployment requires explicit owner approval.
- Do NOT suggest or execute mainnet deployment operations.

## Git Commit Rules
- **NEVER** reference any "phase", "prompt", "step", task number, or agent meta-process in commit messages (e.g., do NOT write "Phase 2", "Prompt 3 implementation", "Task completed").
- Concisely and directly describe **what was built, modified, or uploaded** (e.g., `feat: implement private risk scoring model and TEE attestation verification`, `fix: add build artifact exclusions to gitignore`).
- Follow standard semantic commit conventions (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).

## Core Project Policies
- **Strict Runtime Boundaries**: In-DON (`src/handlers/`) is strictly pure TypeScript + `@chainlink/cre-sdk` (no Node built-ins, no browser globals). Off-DON services are standard Node/React but strictly bound by the privacy contract.
- **Zero-Leakage Privacy Contract**: Never log, persist, or expose private weights, thresholds, policy profiles, or intermediate calculations. Only the final score, recommendation, reason codes, and signed attestation leave the TEE.
- **Subgraph Schema Ground Truth**: Never hallucinate GraphQL field names; verify live Aave V3 and Morpho subgraph entity structures before mapping.
- **Explicit Git Authorization**: NEVER run `git add`, `git commit`, or `git push` unless directly requested by the user in the prompt.


<!-- cloude-code-toolbox:mcp-skills-awareness-begin -->

### MCP & Skills awareness (Cloude Code ToolBox)

_Last synced: 2026-09-04T08:05:54.779Z._

- **Full report:** `.claude/cloude-code-toolbox-mcp-skills-awareness.md` in this workspace. Use it as ground truth for configured servers and skill folders.
- **MCP:** For **live tools** in Claude Code, enable the matching server via `/mcp`. Servers are configured in `~/.claude.json` (user) and `.mcp.json` (project).
- **When the user’s task matches a server**, prefer that server id and plan on tool use.
- **Skills:** Folders below contain `SKILL.md`; attach or cite paths in chat when relevant.

#### Workspace MCP
- `c:\Users\jmgra\antigravityagents\.agents\workflows\privatesignal\.mcp.json` _(workspace: privatesignal)_ — _file missing_

#### Project skills
- Chainlink Skills root: `C:\Users\jmgra\antigravityagents\.agents\skills\chainlink-skills`

<!-- cloude-code-toolbox:mcp-skills-awareness-end -->
