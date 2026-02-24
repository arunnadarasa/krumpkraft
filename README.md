# KrumpKraft OpenClaw Agents

Agentic Krump Commerce on **EVVM Story** (Aeneid) using **USDC.k**. Autonomous agents (Verifier, Choreographer, Miner, Treasury) verify dance moves, process payments via x402, and collaborate. Includes an HTTP API for a Minecraft mod (ClaudeCraft-style) and a React dashboard.

## Overview

- **Verifier** – Validate dance moves against registered IP (Story), receive USDC.k fees
- **Treasury** – Distribute fees to operational multisig and royalty pool
- **Miner** – Discover and extract dance resources
- **Choreographer** – Create commissions, request verification

Agents use OpenClaw messaging, pay via x402/EVVM, and persist state in JSON memory.

## Prerequisites

- Node.js 18+
- Story Aeneid RPC (e.g. `https://aeneid.storyrpc.io`)
- Deployed: USDC.k, KrumpVerify, KrumpTreasury, EVVM Core, EVVM Native x402 Adapter
- Optional: Krump Verify relayer (POST /x402/pay) for receipt-based payments

## Quick Start

```bash
cd <repo-root>
npm install
cp .env.example .env
# Edit .env: set STORY_RPC_URL, KRUMP_VERIFY_ADDRESS, agent private keys, etc.
npm run build
npm run start:swarm
```

API runs on port 8081. Try:

- `GET http://localhost:8081/health`
- `GET http://localhost:8081/api/v1/agents`
- `GET http://localhost:8081/api/v1/discover`

## Configuration (.env)

| Variable | Description |
|----------|-------------|
| STORY_RPC_URL | Story Aeneid RPC (default: https://aeneid.storyrpc.io) |
| USDC_K_ADDRESS | USDC.k token on Story |
| EVVM_CORE_ADDRESS | EVVM Core 1140 |
| EVVM_X402_ADAPTER_ADDRESS | EVVM Native x402 Adapter |
| KRUMP_VERIFY_ADDRESS | KrumpVerify contract |
| KRUMP_TREASURY_ADDRESS | Optional; can be read from KrumpVerify.treasury() |
| X402_RELAYER_URL | Optional; Krump Verify relayer for POST /x402/pay |
| IP_TOKEN_ADDRESS | Optional; IP/WIP token for dashboard balance (Aeneid WIP default) |
| STORY_API_KEY | Optional; Story Protocol v4 API key for IP asset count on dashboard |
| VERIFIER_PRIVATE_KEY, CHOREOGRAPHER_PRIVATE_KEY, etc. | Agent wallet keys (hex) |
| API_PORT | API server port (default 8081) |

## API Endpoints

- `GET /health` – Health check
- `GET /status` – Swarm status
- `GET /api/v1/agents` – List agents
- `GET /api/v1/agents/:id` – Agent status
- `POST /api/v1/agents/:id/command` – Run command (submitVerification, distribute, …)
- `POST /api/v1/agents/:id/message` – Send message to agent
- `GET /api/v1/swarm/state` – Swarm state + agents
- `GET /api/v1/commissions`, `POST /api/v1/commissions` – Commissions
- `GET /api/v1/bluemap/agents` – Agent positions (BlueMap)
- `POST /command` – ClaudeCraft-style webhook
- `POST /minecraft/chat` – In-game chat (!balance, !commission, !games, !join)
- `GET /api/v1/discover` – API discovery

## Dashboard

```bash
cd dashboard
npm install
cp .env.example .env   # set VITE_API_URL=http://localhost:8081
npm run dev
```

Open http://localhost:5173.

### Dashboard: Story API and token balances

- **Story Protocol v4 API** is used for **IP Assets** (count of IP assets per agent). It is documented in this README (config table) and in `.env.example` as `STORY_API_KEY`. If `STORY_API_KEY` is not set, the dashboard shows **—** in the IP Assets column and no "IP Assets (Story)" card.
- **Balance (USDC.k)** comes from chain (RPC + ERC20). **$IP (native)** is Story’s gas token and is fetched via `eth_getBalance` (no token contract). **IP (WIP)** is the wrapped IP token on Aeneid by default (`IP_TOKEN_ADDRESS` or auto when RPC is Aeneid). For token price or gas data, use [Storyscan API](https://www.storyscan.io/api/v2/stats) (`coin_price`, `gas_prices`, etc.).

## Minecraft Mod

A **Paper 1.21** plugin in `minecraft-mod/` provides the in-game frontend:

- **!-commands in chat**: `!arena`, `!balance <id>`, `!commission`, `!games`, `!join` — the plugin POSTs to the API and sends replies to the player.
- **Agent markers**: Polls `GET /api/v1/bluemap/agents` and spawns armor-stand markers at each agent’s `(x,y,z)` with nametags.

Build and install: see [minecraft-mod/README.md](minecraft-mod/README.md). Requires Java 21 and Paper 1.21.4.

## Contracts

**KrumpKraftMod.sol** – On-chain agent registry and positions (EVVM). Optional: use it so other contracts and UIs can read agent list/positions from chain; the API and mod work without it (in-memory state).

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)
- Dependencies are installed via `forge install` (see below; already done if `lib/openzeppelin-contracts` exists).

### Build

```bash
cd <repo-root>
forge build
```

### Test run (recommended before mainnet)

Deploy to a **local fork** of Story Aeneid so you can verify the deploy and calls without spending gas:

1. **Start a local fork** (in a separate terminal):

   ```bash
   anvil --fork-url https://aeneid.storyrpc.io
   ```

2. **Deploy with the script** (uses default anvil key `0xac0974...` for testing; do not use on mainnet):

   ```bash
   export ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   export USDC_K_ADDRESS=0xd35890acdf3BFFd445C2c7fC57231bDE5cAFbde5   # or from .env
   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
   ```

   Or deploy with `forge create`:

   ```bash
   forge create contracts/KrumpKraftMod.sol:KrumpKraftMod \
     --rpc-url http://127.0.0.1:8545 \
     --private-key $ADMIN_PRIVATE_KEY \
     --constructor-args $(cast abi-encode "constructor(address)" $USDC_K_ADDRESS)
   ```

3. Optionally call `registerAgent` / `updatePosition` with `cast send` to confirm the contract works.

### Deploy to Story Aeneid (and verify on Blockscout)

After the test run succeeds:

1. Set an **admin** key with enough **$IP** for deployment and future admin txs:
   ```bash
   export ADMIN_PRIVATE_KEY=0x...   # your secure key
   export STORY_RPC_URL=https://aeneid.storyrpc.io
   export USDC_K_ADDRESS=0xd35890acdf3BFFd445C2c7fC57231bDE5cAFbde5
   ```

2. Deploy and verify on [Blockscout (Aeneid)](https://aeneid.storyscan.io/) with 10 Gwei gas:
   ```bash
   forge script script/Deploy.s.sol \
     --rpc-url $STORY_RPC_URL \
     --broadcast \
     --verify \
     --verifier blockscout \
     --verifier-url https://aeneid.storyscan.io/api/ \
     --with-gas-price 10gwei
   ```
   Or with `forge create` (same verify + gas flags):
   ```bash
   forge create contracts/KrumpKraftMod.sol:KrumpKraftMod \
     --rpc-url $STORY_RPC_URL --private-key $ADMIN_PRIVATE_KEY \
     --constructor-args $(cast abi-encode "constructor(address)" $USDC_K_ADDRESS) \
     --verify --verifier blockscout --verifier-url https://aeneid.storyscan.io/api/ \
     --with-gas-price 10gwei
   ```

3. Save the deployed contract address and add it to your app config (e.g. `KRUMP_KRAFT_MOD_ADDRESS`) when you wire the swarm to sync registry/positions on-chain.

## Scripts

- `npm run build` – Compile TypeScript
- `npm run start:swarm` – Start swarm + API (env-configured agents)
- `npm run example:two-agents` – Two-agent smoke test
- `npm run dashboard` – Start React dashboard dev server

## Security

- Do not commit `.env` or `memory/*.json`.
- Put API behind reverse proxy with auth if exposed.
- Use role separation for agent keys.

## License

MIT
