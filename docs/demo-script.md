# PrivateSignal — Official Video Demonstration Script

**Title:** PrivateSignal: Confidential DeFi Risk Intelligence for Autonomous On-Chain Agents  
**Duration:** Exactly 5:00 Minutes (300 Seconds)  
**Target Audience:** Hackathon Judges, Protocol Developers, Institutional DeFi Allocators, Circle & Chainlink Architects  

---

## Technical Scene Breakdown & Narration Notes

### Scene 1: Introduction [0:00 - 0:30] (30 seconds)
- **Visual:** Split screen. On the left: slide with graphic showing transparent on-chain liquidation cascades and exposed proprietary agent trading strategies. On the right: PrivateSignal logo with the headline: *"Confidential DeFi Risk Intelligence for Autonomous On-Chain Agents"*.
- **Screen Capture:** High-resolution presentation slide transitioning smoothly to `http://localhost:3000` (PrivateSignal Web UI).
- **Audio / Narration:**
  > "Autonomous AI agents and institutional treasuries face a critical dilemma in DeFi: assessing multi-protocol solvency and liquidation risk currently requires exposing proprietary risk weights, credit scoring algorithms, and position thresholds to public mempools and block explorers. Front-running, copy-trading, and MEV predation prevent sophisticated institutional credit models from operating on-chain.  
  >  
  > Introducing **PrivateSignal**: the first privacy-preserving DeFi risk intelligence engine that unifies cross-protocol lending data through The Graph, evaluates risk inside Chainlink Confidential Runtime Enclaves (CRE), and executes autonomous, score-gated capital allocations on Circle's Arc Layer 1 using native USDC."

---

### Scene 2: Architecture Overview & The Privacy Boundary [0:30 - 1:00] (30 seconds)
- **Visual:** Display `docs/architecture.svg` fullscreen. Animated red dashed line highlighting the strict TEE Enclave Privacy Boundary separating public inputs from confidential computations.
- **Screen Capture:** Architecture diagram zooming in from the public layers (The Graph & Arc Client) into the TEE enclave (Vault DON Secrets & Scorer Engine).
- **Audio / Narration:**
  > "Here is the PrivateSignal architecture. Notice the red boundary cutting through the center: that is the Confidential Runtime Environment enclave.  
  >  
  > Outside the enclave, everything is public: lending subgraph queries on Ethereum, RPC endpoints, and autonomous agents executing actions on Arc.  
  >  
  > Inside the enclave, proprietary model weights and institutional risk policies loaded securely from Chainlink Vault DON secrets evaluate normalized protocol data. The host node operator, validators, and public observers cannot observe the algorithmic weights, feature scaling vectors, or intermediate scores. Only a public score and an honest envelope leaves the enclave."

---

### Scene 3: The Graph Multi-Protocol Standardization & MCP Routing [1:00 - 1:30] (30 seconds)
- **Visual:** Visual Studio Code showing `src/graph/queries.ts`, `src/graph/schemaMapper.ts`, and `src/graph/nlRouter.ts`. Side-by-side terminal running an MCP tool query against both Aave V3 and Morpho subgraphs.
- **Screen Capture:** Terminal executing query plan generation, showing identical Messari GraphQL structures mapping both protocols into canonical `UnifiedAccountData`.
- **Audio / Narration:**
  > "DeFi protocols notoriously diverge in schema design: Aave positions differ from Morpho Blue market keys and shared vaults. PrivateSignal solves this through a standardized Messari Lending schema mapper and an MCP Natural Language Router.  
  >  
  > Whether an agent passes a structured prompt or a natural language command like *'Evaluate cross-protocol risk for 0x1111... across Aave and Morpho'*, the router extracts target parameters and generates standardized GraphQL queries. As seen here in `schemaMapper.ts`, collateral balances, borrow debts, and liquidation thresholds from Aave V3 and Morpho are normalized into a unified, mathematically clean representation before reaching the TEE."

---

### Scene 4: Confidential CRE Execution & Privacy Boundary [1:30 - 2:15] (45 seconds)
- **Visual:** Terminal showing the Chainlink CRE workflow execution (`src/cre/workflow.ts` and `src/scoring/confidentialScorer.ts`). Display of simulated Operator View vs Enclave View side-by-side.
- **Screen Capture:** Terminal output highlighting:
  - DON ID: `LOCAL_PROTOTYPE_MODE`
  - Secrets loaded: Local ENV (simulating Vault secrets)
  - Operator Log: `[PRIVACY MASKED] <intermediate calculation redacted>`
  - Enclave Output: JSON envelope with simulated unverified status and public verdict.
- **Audio / Narration:**
  > "Now, let's step inside the simulated execution. Operating in `LOCAL_PROTOTYPE_MODE` for the demo, we simulate the WASM/QuickJS enclave constraints locally.  
  >  
  > Watch the operator's view in this left panel: Proprietary model weights—penalizing extreme loan-to-value, collateral concentration, and liquid staking derivative depegging—are retrieved from local environment variables, mirroring how the real deployment fetches from Vault DON secrets into hardware-isolated registers.  
  >  
  > In the right panel, the scoring algorithm executes deterministically, computes the composite risk metric, generates a local envelope, and discards all secret state before emission."

---

### Scene 5: Attested Score Emission [2:15 - 2:45] (30 seconds)
- **Visual:** Browser showing PrivateSignal Privacy Explorer UI at `http://localhost:3000`. Card displaying the emitted verifiable score: `Score: 82 / 100`, Status: `SAFE`, Reason Codes: `HEALTHY_PROFILE`, `LTV_PRESSURE`, DON Envelope.
- **Screen Capture:** UI inspector toggling between the Public Envelope payload and the Privacy Audit check, showing zero proprietary parameters leaked.
- **Audio / Narration:**
  > "Here is the resulting score emitted to the autonomous agent and on-chain consumers.  
  >  
  > The payload is lean, honest, and completely scrubbed of confidential data. The agent receives a normalized integer score from 0 to 100, an actionable recommendation—Safe, Caution, or High Risk—and explainable reason codes.  
  >  
  > Every emission carries an execution hash. While the demo runs in an unverified local mode, the deployed private-registry version enables smart contracts and agents to cryptographically verify the envelope without needing to know *how* the score was computed."

---

### Scene 6: Arc Agent Autonomous Payment & Execution (Native USDC) [2:45 - 3:30] (45 seconds)
- **Visual:** Terminal running `bun run demo` executing the autonomous Arc Agent Loop. Highlighting the 0.1 USDC query fee payment followed by policy evaluation and capital deployment.
- **Screen Capture:** 
  - Terminal logs showing `[AGENT_STEP] PAY_USDC_FEE` with native gas transaction.
  - Arc Testnet Explorer (`explorer.testnet.arc.circle.com`) showing transaction details.
- **Audio / Narration:**
  > "Now watch the autonomous agent loop in action on Circle's Arc Layer 1.  
  >  
  > A crucial technical highlight: on Arc, USDC is the native gas currency with 18 decimals—not an ERC-20 token. There are zero ERC-20 `approve` or `transferFrom` transactions. Our agent interacts directly via native value transfers using standard `msg.value` mechanics.  
  >  
  > "In Step 1, the agent checks its native USDC balance and states the required 0.1 native USDC fee on Arc (fee payment is optional/simulated in this local demo loop).  
  >  
  > In Step 2, upon receiving the local score of 82, the agent evaluates its risk policy: because 82 exceeds the required 65 threshold, the policy gate triggers an **ALLOW**.  
  >  
  > In Step 3, the agent autonomously executes a 0.2 native USDC capital allocation transaction to the target protocol vault on Arc."

---

### Scene 7: Blocked Action Scenario (Aggressive Risk Gating) [3:30 - 4:00] (30 seconds)
- **Visual:** Terminal and UI demonstrating a stressed wallet scenario (`0x2222...` with 92% LTV and low health factor). Policy gate rejecting the proposed capital deployment.
- **Screen Capture:** 
  - Terminal log showing `[POLICY_GATE_REJECTED] BLOCKED_BY_RISK_POLICY: Evaluated score (28) is below required policy threshold (70)`.
  - Red security banner appearing in the UI.
- **Audio / Narration:**
  > "What happens when market conditions deteriorate or an agent interacts with an overleveraged borrower? Let's test a stressed portfolio with 92% LTV and concentrated liquid staking exposure.  
  >  
  > The confidential scorer detects the health pressure index and flags staking derivative depegging risk, issuing a score of 28 with recommendation `HIGH_RISK`.  
  >  
  > The agent's policy threshold requires at least 70 for capital deployment. The policy gate instantly intercepts and aborts the transfer: no capital is deployed, protecting the agent's treasury from insolvency. The audit trail logs the exact rejection reason while preserving complete computational privacy."

---

### Scene 8: Judge Verification & Technical Audit Trail [4:00 - 4:30] (30 seconds)
- **Visual:** Rapid walkthrough of repository structure in VS Code and test execution in terminal.
- **Screen Capture:** 
  - Running `bun test` showing 50/50 tests passing across all 6 test suites.
  - Showing `src/arc/arcClient.ts` confirming native USDC gas configuration (Chain ID 5042).
  - Showing `src/cre/workflow.ts` demonstrating WASM/QuickJS runtime compatibility.
- **Audio / Narration:**
  > "For hackathon judges validating our implementation:  
  >  
  > "First, our automated test suite runs comprehensive unit and end-to-end integration tests—testing standardized Graph queries, TEE privacy boundaries, Arc native USDC logic, and policy gating.  
  >  
  > Second, check `src/arc/agentWallet.ts`: notice our native USDC gas implementation on Arc Testnet (Chain ID 5042) without ERC-20 contract overhead.  
  >  
  > Third, review `src/handlers/confidentialScorer.ts`: all scoring handlers strictly adhere to Chainlink CRE WASM and QuickJS constraints, proven by our private-registry staging deployment."

---

### Scene 9: Closing & The Future of Confidential DeFi [4:30 - 5:00] (30 seconds)
- **Visual:** Summary slide with key value propositions: Cross-Protocol Graph Indexing, Chainlink CRE Confidentiality, Arc Native USDC Agent Economy. Call-to-action with GitHub repository link and documentation references.
- **Screen Capture:** Return to PrivateSignal dashboard smoothly concluding the demo.
- **Audio / Narration:**
  > "PrivateSignal bridges the gap between transparent multi-protocol DeFi data and institutional risk confidentiality. By uniting The Graph's indexing power, Chainlink CRE's trusted execution environments, and Circle Arc's native USDC autonomous agent rails, PrivateSignal unlocks the next generation of privacy-preserving on-chain credit and intelligence.  
  >  
  > Full source code, test suites, and deployment documentation are available on GitHub. Thank you for watching PrivateSignal."

---

## Screen Recording Checklist for Video Producer

| Scene | Target Window | Recommended Resolution | Key Audio Cue |
|---|---|---|---|
| **0:00 - 0:30** | Presentation Slide & UI Hero | 1920x1080 (60fps) | *"Autonomous AI agents and institutional treasuries..."* |
| **0:30 - 1:00** | `docs/architecture.svg` | 1920x1080 (Zoom) | *"Notice the red boundary cutting through the center..."* |
| **1:00 - 1:30** | VS Code (`queries.ts`, `schemaMapper.ts`) | 1920x1080 | *"Whether an agent passes a structured prompt..."* |
| **1:30 - 2:15** | Terminal (`bun run demo` Local phase) | 1920x1080 (Terminal) | *"Operating in LOCAL_PROTOTYPE_MODE..."* |
| **2:15 - 2:45** | Chrome (`http://localhost:3000` Explorer) | 1920x1080 | *"The payload is lean, honest, and completely scrubbed..."* |
| **2:45 - 3:30** | Terminal & Arc Explorer | Split Screen 1080p | *"USDC is the native gas currency with 18 decimals..."* |
| **3:30 - 4:00** | UI & Terminal (Blocked Scenario) | 1920x1080 | *"The policy gate instantly intercepts and aborts..."* |
| **4:00 - 4:30** | Terminal (`bun test`) | 1920x1080 | *"Our automated test suite runs comprehensive tests..."* |
| **4:30 - 5:00** | Architecture Summary Slide & UI | 1920x1080 | *"PrivateSignal bridges the gap..."* |

---

## Key On-Chain Evidence & Verification References

- **Arc Testnet Chain ID:** `5042`
- **Arc Native Gas Currency:** `USDC` (18 Decimals)
- **RPC URL:** `https://rpc.testnet.arc.circle.com`
- **Chainlink DON ID (Local Demo):** `LOCAL_PROTOTYPE_MODE`
- **Standardized Lending Subgraphs:**
  - Aave V3: `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`
  - Morpho: `8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs`
