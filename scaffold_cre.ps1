param (
    [Parameter(Mandatory=$true)]
    [string]$ProjectName
)

$ErrorActionPreference = "Stop"

Write-Host "Scaffolding $ProjectName with hardened security and gitignore..."

# 1. Initialize CRE TypeScript Workflow
cre init --non-interactive --template=event-reactor-ts --project-name $ProjectName --workflow-name $ProjectName

if (-not (Test-Path ".\$ProjectName")) {
    Write-Error "cre init failed for $ProjectName"
}

# 2. Subdirectory Structure
$dirs = @(".agent\skills", ".agent\rules", "src\workflows", "src\triggers", "src\capabilities", "contracts\abi", "tests")
foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path ".\$ProjectName\$dir" | Out-Null
}

Push-Location ".\$ProjectName"

# 3. .gitignore — CREATED FIRST BEFORE ANY .env OR GIT COMMIT
# Guarantees that .env, build artifacts, telemetry, and private keys can NEVER be tracked or committed
$gitignoreContent = @"
# Environment & secrets
.env
.env*
*.env
*.local
secrets.private.yaml

# Dependencies
node_modules/
bun.lockb
package-lock.json

# Build & artifacts
dist/
build/
build/**
**/build/
**/build/**
*.jsonl
.cre/
*.wasm
.cre_build_tmp.js
binary.wasm

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS & Editor files
.DS_Store
Thumbs.db
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
"@
Set-Content -Path ".gitignore" -Value $gitignoreContent

# 4. .env — Created without any .env.example
$envContent = @"
# ==========================================
# CHAINLINK CRE WORKFLOW ENVIRONMENT TEMPLATE
# ==========================================

# ------------------------------------------
# 1. Deployment Target
# ------------------------------------------
CRE_TARGET=local-simulation

# ------------------------------------------
# 2. Execution Wallet (Secret)
# ------------------------------------------
CRE_ETH_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001

# ------------------------------------------
# 3. Blockchain RPC Endpoints
# ------------------------------------------
ETH_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your_alchemy_api_key_here
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your_alchemy_api_key_here
ARBITRUM_MAINNET_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/your_alchemy_api_key_here
OPTIMISM_MAINNET_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/your_alchemy_api_key_here
POLYGON_MAINNET_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your_alchemy_api_key_here

ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_alchemy_api_key_here
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/your_alchemy_api_key_here
ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/your_alchemy_api_key_here
OPTIMISM_SEPOLIA_RPC_URL=https://opt-sepolia.g.alchemy.com/v2/your_alchemy_api_key_here

# ------------------------------------------
# 4. Third-Party & Arc Integrations
# ------------------------------------------
ALCHEMY_API_KEY=your_alchemy_api_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
BASESCAN_API_KEY=your_basescan_api_key_here
COINGECKO_API_KEY=your_coingecko_api_key_here

# Arc Testnet (Circle L1 - Native USDC)
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
ARC_AGENT_WALLET_ADDRESS=your_wallet_address_here
ARC_FEE_AMOUNT_USDC=0.10
"@
Set-Content -Path ".env" -Value $envContent

# 5. Git Initialization & Automated Ignore Verification Gate
git init
$isIgnored = git check-ignore .env
if (-not $isIgnored) {
    Pop-Location
    Write-Error "CRITICAL SECURITY HALT: .env is NOT ignored by .gitignore! Aborting scaffolding."
}

# 6. project.yaml
$projectYamlContent = @"
version: "1"
targets:
  local-simulation:
    rpcs:
      - chain-name: ethereum-testnet-sepolia
        rpc-url: `${ETH_SEPOLIA_RPC_URL}
      - chain-name: ethereum-testnet-sepolia-base-1
        rpc-url: `${BASE_SEPOLIA_RPC_URL}
"@
Set-Content -Path "project.yaml" -Value $projectYamlContent

# 7. secrets.yaml
$secretsYamlContent = @"
secretsNames: {}
"@
Set-Content -Path "secrets.yaml" -Value $secretsYamlContent

# 8. agent_skills_config.json
$agentSkillsConfig = @"
{
  "chainlink_skills_root": "C:\\Users\\jmgra\\antigravityagents\\.agents\\skills\\chainlink-skills",
  "skills": [
    {
      "name": "chainlink-cre-skill",
      "path": "chainlink-cre-skill/SKILL.md",
      "triggers": ["CRE", "Chainlink workflow", "workflow simulate", "workflow deploy", "cre init", "cre-sdk", "DON", "CRON trigger", "HTTP trigger", "EVM log trigger"],
      "description": "CRE onboarding, workflow generation, CLI/SDK help, triggers (CRON, HTTP, EVM log), HTTP/Confidential HTTP, EVM Read/Write capabilities, secrets, simulation, deployment, and monitoring."
    },
    {
      "name": "chainlink-ccip-skill",
      "path": "chainlink-ccip-skill/SKILL.md",
      "triggers": ["CCIP", "cross-chain", "token transfer", "bridge", "CCT", "cross-chain messaging", "lane", "chain selector"],
      "description": "CCIP cross-chain token transfers and messaging, sender/receiver contracts, CCT token standard, local testing, message status monitoring, and route/lane discovery."
    },
    {
      "name": "chainlink-data-feeds-skill",
      "path": "chainlink-data-feeds-skill/SKILL.md",
      "triggers": ["price feed", "data feed", "AggregatorV3Interface", "latestRoundData", "oracle data", "feed address", "L2 sequencer"],
      "description": "Data Feeds price oracle integration for EVM and non-EVM chains, MVR bundle feeds, SVR/OEV feeds, L2 sequencer uptime checks, and feed monitoring."
    },
    {
      "name": "chainlink-data-streams-skill",
      "path": "chainlink-data-streams-skill/SKILL.md",
      "triggers": ["data streams", "Streams Direct", "report decoding", "data-streams-sdk", "WebSocket stream", "low-latency market data", "onchain verification"],
      "description": "Data Streams REST/WebSocket SDKs, report decoding, on-chain verification, real-time frontend displays, High Availability streaming, and SQLite persistence."
    },
    {
      "name": "chainlink-ace-skill",
      "path": "chainlink-ace-skill/SKILL.md",
      "triggers": ["ACE", "Automated Compliance Engine", "policy enforcement", "ERC-3643", "KYC", "AML", "compliance token", "PolicyEngine", "CCID", "sanctions screening"],
      "description": "ACE core contracts, Policy Management, Cross-Chain Identity, KYC/AML credential registry, regulated tokens (ERC-20/ERC-3643), and managed ACE Platform guidance."
    },
    {
      "name": "chainlink-vrf-skill",
      "path": "chainlink-vrf-skill/SKILL.md",
      "triggers": ["VRF", "verifiable randomness", "random number", "requestRandomWords", "fulfillRandomWords", "VRF subscription", "provably fair"],
      "description": "VRF v2.5 subscription and direct-funding consumers, keyHash and gas lane selection, coordinator address lookup, migration from V2, billing, and supported networks."
    },
    {
      "name": "chainlink-confidential-ai-attester-skill",
      "path": "chainlink-confidential-ai-attester-skill/SKILL.md",
      "triggers": ["confidential AI", "TEE inference", "private inference", "attested AI", "AWS Nitro Enclave", "undercollateralized lending", "attested result"],
      "description": "Confidential AI inference inside a Trusted Execution Environment (TEE). Submit private documents to an LLM and receive a cryptographically attested result without exposing data on-chain."
    }
  ],
  "usage_note": "When a coding agent needs any Chainlink capability, it MUST load the corresponding SKILL.md from the path above before writing code. Never invent Chainlink API patterns from training data alone."
}
"@
Set-Content -Path "agent_skills_config.json" -Value $agentSkillsConfig

# 9. Dependencies Installation
Get-ChildItem -Path "." -Filter "package.json" -Recurse | Where-Object { $_.FullName -notmatch '\\node_modules\\' } | ForEach-Object {
    $dir = $_.Directory.FullName
    Push-Location $dir
    if (Test-Path "bun.lockb") {
        bun install
    } else {
        bun install @chainlink/cre-sdk viem zod
    }
    Pop-Location
}

# 10. Final Verification
Write-Host "[SECURITY AUDIT] Checking git status..."
$status = git status --short
if ($status -match "\.env") {
    Pop-Location
    Write-Error "CRITICAL SECURITY HALT: .env appears in git status! Aborting."
}

Pop-Location
Write-Host "Scaffold complete for $ProjectName. Security checks passed: .env is protected, no .env.example generated, build folders ignored."
