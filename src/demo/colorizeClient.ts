import * as fs from 'fs';

async function colorize() {
  const text = fs.readFileSync(0, 'utf-8');
  let formatted = "";
  try {
    const json = JSON.parse(text);
    formatted = JSON.stringify(json, null, 2);
  } catch (e) {
    formatted = text;
  }

  const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
  };

  formatted = formatted
    .replace(/"SUCCESS"/g, `"${c.green}SUCCESS${c.reset}"`)
    .replace(/"FAILED"/g, `"${c.red}BLOCKED${c.reset}"`)
    .replace(/Attested score: 100\/100 \(SAFE\)/g, `${c.green}Attested score: 100/100 (SAFE)${c.reset}`)
    .replace(/Attested score: 55\/100 \([^)]+\)/g, `${c.red}Attested score: 55/100 (UNSAFE)${c.reset}`)
    .replace(/\[FUNDING_BLOCKED\]([^"\n]+)/g, `${c.red}[FUNDING_BLOCKED]$1${c.reset}`)
    .replace(/"agentWalletAddress":\s*"([^"]+)"/g, `"${c.blue}agentWalletAddress${c.reset}": "${c.blue}$1${c.reset}"`)
    .replace(/"balanceUSDC":\s*"([^"]+)"/g, `"${c.blue}balanceUSDC${c.reset}": "${c.blue}$1${c.reset}"`)
    .replace(/"availableActions":/g, `"${c.blue}availableActions${c.reset}":`)
    .replace(/"transactionHash":\s*"([^"]+)"/g, `"${c.green}transactionHash${c.reset}": "${c.green}$1${c.reset}"\n  ${c.cyan}➔ View on Explorer: https://testnet.explorer.arc.network/tx/$1${c.reset}`);

  console.log(formatted);
}

colorize().catch(console.error);
