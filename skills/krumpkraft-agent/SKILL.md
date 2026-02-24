---
name: krumpkraft
description: Agentic Krump Commerce on EVVM Story. Verifier, Choreographer, Miner, and Treasury agents verify moves, process USDC.k payments via x402, and collaborate. Use for dance/IP verification, commissions, and Minecraft mod integration.
metadata: {"openclaw": {"emoji": "💃", "homepage": ""}}
user-invocable: true
---

# KrumpKraft – Dance Commerce Agents

Autonomous agents for **dance move verification** and **USDC.k payments** on Story (Aeneid).

## Quick start

- **Discovery:** `GET /api/v1/discover` – list endpoints
- **Agents:** `GET /api/v1/agents` – list Verifier, Choreographer, Miner, Treasury
- **Command:** `POST /api/v1/agents/:id/command` with `{ command, params }`

## When to use

- Verify a dance move against registered IP (Story)
- Create or join a commission (choreographer/miner)
- Distribute treasury fees (treasury agent)
- Integrate with Minecraft mod (BlueMap agents, !-commands)

## Environment

Set `STORY_RPC_URL`, `KRUMP_VERIFY_ADDRESS`, agent `*_PRIVATE_KEY`, and optional `X402_RELAYER_URL`. See README and .env.example.
