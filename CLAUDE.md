# Claude Code — Project Context: PrivateSignal CRE Workflow

# CLAUDE.md — CRE Workflow Project: privatesignal

You are working in a Chainlink CRE TypeScript workspace. All code compiles to WASM and runs in a DON.

## Hard Rules
- PROHIBITED: Node.js built-ins (`fs`, `crypto`, `http`, `os`, `path`, `buffer`, etc.)
- PROHIBITED: Browser globals (`fetch`, `setTimeout`, `setInterval`, `localStorage`, etc.)
- REQUIRED: Use only `@chainlink/cre-sdk` for all runtime interfaces.
- Determinism: Use `runtime.Now()` / `runtime.now()`, not `Date.now()`.
- Security: Secrets are references only — never hardcode keys or tokens.
- Before writing any Chainlink integration, load the relevant SKILL.md from the paths listed in `agent_skills_config.json`.
- ALWAYS run `cre workflow simulate privatesignal --target local-simulation` before any testnet deployment.
- Do NOT suggest or execute mainnet deployment operations.

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
