# PrivateSignal Live Demo Playbook

## Before the Demo

### 1. Terminal Setup
Open **2 terminals** in the project root (`c:\Users\jmgra\antigravityagents\.agents\workflows\privatesignal`):

- **Terminal 1 Purpose:**
  - Run the primary automated demo (`--auto`)
  - Start the REST API server for Part 2
- **Terminal 2 Purpose:**
  - Run single-line `curl` API requests
  - Run the 124-test automated verification suite
  - Optionally run the Chainlink CRE simulation

### 2. Quick Pre-Check
Ensure the following before presenting:
- Dependencies installed: `bun install`
- Environment configured: `.env` file present
- Port availability: Port `3001` is free

---

## Part 1 — Core Live Demo

### 💻 Terminal 1 Command:
```powershell
bun run src/demo/runDemo.ts --auto
```

### 🎙️ Part 1 Spoken Narration (Read as command executes):

> *"Welcome everyone. This is **PrivateSignal**.*
>
> *DeFi risk is public, but risk strategy shouldn’t be. If you publish your evaluation model, you leak edge and intent. If you hide it on a centralized server, you lose verifiability.*
>
> *PrivateSignal solves that: live cross-protocol risk data from The Graph is scored inside a Chainlink CRE TEE, then used to allow or block treasury USDC releases on Arc.*
>
> *Screen setup: Terminal 1 is our agent orchestrator and API server. Terminal 2 is the external client for API calls and verification.*
>
> *In Terminal 1, we run the live flow. Graph aggregates Aave and Morpho positions and cross-protocol leverage features. CRE scores the payload with Vault-sealed weights, and only the public score leaves the enclave. This workflow is live on CRE private staging.*
>
> *On the allow path, a healthy score clears policy and triggers `FUNDING_RELEASED` — a treasury capital release, not a fee.*
>
> *Operators see the public score and result; sealed weights stay inside the TEE.*
>
> *On the deny path, an overleveraged counterparty fails policy, returns `FUNDING_BLOCKED`, and 0 USDC moves. High risk blocks funding. Healthy portfolios receive treasury capital."*

---

## Part 2 — API Path

### 💻 Step 1: In Terminal 1 — Start the Backend Server
```powershell
bun run src/api/server.ts
```

> *"PrivateSignal exposes a REST API so external agent swarms and institutional treasuries can integrate policy-gated releases into their autonomous pipelines."*

---

### 💻 Step 2: In Terminal 2 — Inspect Agent & Treasury Status
```powershell
curl.exe -s http://localhost:3001/api/agent/status | bun -e "const d = await Bun.stdin.json(); console.log('\x1b[32m' + JSON.stringify(d, null, 2) + '\x1b[0m')"
```

> *"A status check returns the agent's Arc L1 treasury address, available native USDC balance, and registered candidate action policies."*

---

### 💻 Step 3: In Terminal 2 — Trigger Approved Treasury Release (Allow Path)
```powershell
curl.exe -s -X POST http://localhost:3001/api/agent/run -H "Content-Type: application/json" -d '{\"walletAddress\": \"0x5b11D95bd844e5DE93bC9759a35fc89b40152133\", \"policyThreshold\": 65, \"candidateAction\": \"treasury_release\", \"actionAmountUSDC\": 0.20, \"policyProfileId\": \"conservative\", \"dryRun\": false}' | bun -e "const d = await Bun.stdin.json(); console.log('\x1b[32m' + JSON.stringify(d, null, 2) + '\x1b[0m')"
```

> *"When an approved counterparty is evaluated, the API runs the full Graph-to-CRE-to-Arc pipeline and returns FUNDING_RELEASED with the on-chain transaction hash."*

---

### 💻 Step 4: In Terminal 2 — Trigger Blocked Capital Release (Deny Path)
```powershell
curl.exe -s -X POST http://localhost:3001/api/agent/run -H "Content-Type: application/json" -d '{\"walletAddress\": \"0x2222222222222222222222222222222222222222\", \"policyThreshold\": 80, \"candidateAction\": \"settlement_release\", \"actionAmountUSDC\": 0.50, \"policyProfileId\": \"aggressive\", \"dryRun\": false}' | bun -e "const d = await Bun.stdin.json(); console.log('\x1b[32m' + JSON.stringify(d, null, 2) + '\x1b[0m')"
```

> *"When a high-risk portfolio hits the endpoint, the API immediately returns FUNDING_BLOCKED, halting capital movement and protecting the treasury."*

---

## Part 3 — Quick Proof (Automated Invariant Verification)

### 💻 In Terminal 2 — Run the 124-Test Audit Suite:
```powershell
bun test tests/testing3.test.ts
```

### 🎙️ Narration (Read as Tests Execute):
> *"To prove institutional robustness, we run our 124 automated tests. This formally verifies our fail-closed safety invariant, exact policy threshold boundaries, privacy leak prevention, and live Arc native USDC transaction execution."*
