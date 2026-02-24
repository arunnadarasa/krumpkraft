# Run KrumpKraft Mod Locally

## What’s already set up

1. **Plugin JAR** – Built at `build/libs/KrumpKraftMod-0.1.0.jar`.
2. **Local Paper server** – In `server/`:
   - Paper 1.21.4
   - KrumpKraftMod in `server/plugins/`
   - `eula.txt` set to `true`
   - Listens on **localhost:25565**
3. **KrumpKraft API** – Should be running on **http://localhost:8081** (e.g. from `npm run start:swarm` in the skill root).

## Start the Minecraft server

From this directory (`minecraft-mod/`):

```bash
cd server
./start.sh
```

Uses Java 21 (e.g. `/opt/homebrew/opt/openjdk@21/bin/java` if set in the script). Wait until you see something like “Done” and the server is ready.

## Connect and test

1. Start **Minecraft Java Edition 1.21.4**.
2. Multiplayer → Add server → **localhost** or **127.0.0.1**.
3. Join the server.
4. In chat, type:
   - **!arena** – list KrumpKraft commands
   - **!games** – agent/task summary from the API

Replies appear as `[KrumpKraft] ...`. The plugin calls `http://localhost:8081/minecraft/chat` for every message that starts with `!`.

## Config

After the first run, edit **`server/plugins/KrumpKraftMod/config.yml`**:

- **api.url** – KrumpKraft API base URL (default `http://localhost:8081`). If the API is on another host/port, change it here.
- **markers.enabled** – `true` to spawn armor-stand agent markers (positions from the API).

Restart the server after changing config.
