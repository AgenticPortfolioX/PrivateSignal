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
    red: '\x1b[31m'
  };

  formatted = formatted
    .replace(/"SUCCESS"/g, `"${c.green}SUCCESS${c.reset}"`)
    .replace(/"FAILED"/g, `"${c.red}BLOCKED${c.reset}"`)
    .replace(/Attested score: 100\/100 \(SAFE\)/g, `${c.green}Attested score: 100/100 (SAFE)${c.reset}`)
    .replace(/Attested score: 55\/100 \([^)]+\)/g, `${c.red}Attested score: 55/100 (UNSAFE)${c.reset}`)
    .replace(/\[FUNDING_BLOCKED\]([^"\n]+)/g, `${c.red}[FUNDING_BLOCKED]$1${c.reset}`);

  console.log(formatted);
}

colorize().catch(console.error);
