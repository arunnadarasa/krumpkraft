# KrumpKraft Minecraft Mod (Paper Plugin)

Paper plugin that connects to the KrumpKraft API: in-game **!-commands** and **agent markers** (armor stands) at API-reported positions.

## Requirements

- **Paper 1.21.4** (or compatible)
- **Java 21**
- KrumpKraft API running (e.g. `npm run start:swarm` on port 8081)

## Build

You need **Gradle** (or the wrapper). From the `minecraft-mod` directory:

```bash
# If you have Gradle installed:
gradle wrapper
./gradlew jar

# Or with an existing Gradle wrapper:
./gradlew jar
```

JAR: `build/libs/KrumpKraftMod-0.1.0.jar`

## Install

1. Copy the JAR into your server `plugins/` folder.
2. Start the server once to generate `plugins/KrumpKraftMod/config.yml`.
3. Edit `config.yml` and set `api.url` to your KrumpKraft API (e.g. `http://localhost:8081` or `http://your-server:8081`).
4. Restart the server.

## Config (`config.yml`)

| Key | Description |
|-----|-------------|
| `api.url` | KrumpKraft API base URL (default `http://localhost:8081`) |
| `api.timeout-ms` | HTTP timeout (default 5000) |
| `api.sync-interval-ms` | How often to poll agents for markers (default 5000) |
| `markers.enabled` | Spawn armor stand markers for agents (default true) |
| `markers.spawn-world` | World name for markers (default `world`) |
| `markers.show-role` | Show role in nametag e.g. "Name (verifier)" (default true) |

## In-game

- **Chat commands** (message must start with `!`):
  - `!arena` or `!help` – list commands
  - `!balance <agentId>` – agent USDC.k balance
  - `!commission <description> <budget>` – create commission
  - `!pay <agentId> <to> <amount>` – send USDC.k via x402 (relayer)
  - `!usdc <agentId> <to> <amount>` – send USDC.k (direct ERC-20 transfer)
  - `!jab <agentId> <to> <amount>` – send JAB (KRUMP)
  - `!ip <agentId> <to> <amount>` – send native $IP (gas token)
  - `!games` – agent/task summary
  - `!join <commissionId>` – join commission (miner)

  The plugin POSTs your message to the API and sends the reply back to you as `[KrumpKraft] ...`.

- **Agent markers**: If `markers.enabled` is true, the plugin polls `GET /api/v1/bluemap/agents` and spawns small, invisible armor stands at each agent’s `(x,y,z)` with a nametag (e.g. `Krump Verifier (verifier)`). They update on the sync interval.

## API contract

- **GET** `{api.url}/api/v1/bluemap/agents` → `{ agents: [ { id, name, role, state, x, y, z } ] }`
- **POST** `{api.url}/minecraft/chat` body `{ "player": "<name>", "message": "<text>" }` → `{ "reply": "..." }` or `{ "replies": ["...", "..."] }`
