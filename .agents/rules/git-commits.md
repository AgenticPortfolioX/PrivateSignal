# Git Commit Message Guidelines

## Core Principles
1. **No Meta-Process References**:
   - **NEVER** reference "phase", "prompt", "step", internal task IDs, or agent orchestration prompts in commit messages.
   - Prohibited examples: `Phase 2 complete`, `Prompt 4: Graph queries`, `Task-123 changes`.

2. **Describe What Was Built**:
   - Concisely and directly state the functional capabilities, components, or fixes built, modified, or uploaded.
   - Recommended examples:
     - `feat: implement confidential risk scorer with TEE attestation verification`
     - `feat: add unified GraphQL schema mapper for Aave and Morpho subgraphs`
     - `fix: harden .gitignore against build directory and telemetry leaks`
     - `docs: add architectural privacy boundary specification`

3. **Standard Semantic Types**:
   - `feat:` for new features or capabilities
   - `fix:` for bug or security fixes
   - `chore:` for build, dependency, or configuration updates
   - `docs:` for documentation updates
   - `test:` for adding or updating tests
   - `refactor:` for code restructurings without behavior changes
