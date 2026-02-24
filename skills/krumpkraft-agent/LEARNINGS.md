# KrumpKraft Agent: Learnings, Successes & Failures

A running log of what we learned, what worked, and what didn’t while building and deploying the KrumpKraft agent skill and KrumpKraftMod contract on Story EVVM.

---

## Learnings

### Contracts & deployment

- **No need to deploy KrumpVerify** – The agent uses an existing KrumpVerify deployment. You only set `KRUMP_VERIFY_ADDRESS` in `.env`. That contract lives in the Krump Verify project; KrumpKraft doesn’t deploy it.
- **KrumpKraftMod.sol is optional** – It’s an on-chain agent registry/positions store. The mod and BlueMap use `GET /api/v1/bluemap/agents`, which is filled from the swarm’s in-memory state. Deploy KrumpKraftMod only if you want that data on-chain (EVVM composability, other contracts reading it).
- **Story uses $IP for gas, not ETH** – On Story (Aeneid and mainnet), the native token for gas is **$IP**. Foundry still prints “ETH” in estimates; on Story that means $IP. The deployer wallet must hold $IP.
- **Test run before mainnet** – Deploy to a local fork first: `anvil --fork-url https://aeneid.storyrpc.io`, then `forge script ... --rpc-url http://127.0.0.1:8545 --broadcast`. No real gas cost; confirms constructor and flow.
- **Blockscout verification** – Story Aeneid explorer is at https://aeneid.storyscan.io/. Verification uses Blockscout: `--verifier blockscout --verifier-url https://aeneid.storyscan.io/api/`. Add `/api/` to the explorer URL (per Story docs).
- **Private key format** – `ADMIN_PRIVATE_KEY` in `.env` should be **with** the `0x` prefix, then 64 hex characters (e.g. `ADMIN_PRIVATE_KEY=0x...`).
- **`.env` location** – The deploy command must be run from `skills/krumpkraft-agent/` and that directory must contain `.env`. If the command is run from elsewhere or `.env` is missing, you get “No such file or directory: .env”.
- **Gas price** – On Aeneid, 10 Gwei can be slow or stuck. 15–20 Gwei is a reasonable next step; 50 Gwei for faster inclusion. Cost scales linearly (e.g. ~0.025 $IP at 10 Gwei → ~0.125 $IP at 50 Gwei for this deploy).

### EVVM positioning

- **Deploying KrumpKraftMod** strengthens “EVVM-focused”: agent registry (and optionally positions) live on-chain; other EVVM apps can read them. Tradeoff: gas for `updatePosition` and sync logic; recommend throttled/batched position updates.
- **Staying in-memory only** is simpler and free but doesn’t give on-chain composability or a clear “state on EVVM” story.

### Agent / LLM

- **Persistent memory** – A small in-loop memory (e.g. last 25 entries: events + failures) is fed into the LLM context so the bot can avoid repeating failed actions (e.g. “skip chat — bot not in world”). Events: chat, commission, pay, dance. Failures: skip chat, pay fail, catch errors.

---

## Successes

- **Foundry setup** – Added `foundry.toml` (src = `contracts`, solc 0.8.24, remappings for OpenZeppelin and forge-std). Installed `openzeppelin-contracts` and `forge-std` with `forge install ... --no-git` (works without a git repo).
- **`forge build`** – Compiles `KrumpKraftMod.sol` and `script/Deploy.s.sol` successfully (only linter notes).
- **Test run on anvil** – Deployed KrumpKraftMod to a local fork; contract address logged; “ONCHAIN EXECUTION COMPLETE & SUCCESSFUL” on the fork.
- **Deploy script** – `script/Deploy.s.sol` uses `ADMIN_PRIVATE_KEY` and `USDC_K_ADDRESS` from env, deploys KrumpKraftMod, logs address.
- **Contract credits** – Added NatSpec to `KrumpKraftMod.sol`: `@author Asura aka Angel of Indian Krump`, `@custom:website`, `@custom:initiative`, `@custom:credits` (StreetKode Fam).
- **README** – Documented test run (anvil fork), deploy to Aeneid, and verify on Blockscout with 10 Gwei; included `forge create` variant.
- **npm script** – `npm run deploy:contract` runs the forge script with verify and 10 Gwei (override with `--with-gas-price 50gwei` etc. when running manually).
- **LLM persistent memory** – In-loop memory store (last 25 entries), pushed on chat/commission/pay/dance and on failures; included in “Recent memory” in the LLM user message.
- **.gitignore** – Added `out/`, `broadcast/`, `cache/`, `lib/` for Foundry.

---

## Failures

- **Deploy to Aeneid never confirmed in-session** – Multiple runs of `forge script ... --broadcast --verify` were either backgrounded due to timeout or failed before we saw “ONCHAIN EXECUTION COMPLETE”. So we never confirmed a live deployment or verification in the agent run.
- **“already known”** – After a first deploy attempt, a second run (same key) failed with “Failed to send transaction after 4 attempts Err(server returned an error response: error code -32000: already known)”. The node already had that tx (same nonce); re-broadcasting the same tx was rejected.
- **Verification failed: “Address is not a smart-contract”** – `forge verify-contract` reported the address had no code. That was consistent with `cast code <address> --rpc-url https://aeneid.storyrpc.io` returning `0x`, meaning either the deploy tx never landed or we were checking before it was mined.
- **`.env` not found** – When the deploy was run from a different context, the error was “No such file or directory: .env”. Fix: ensure `.env` exists in `skills/krumpkraft-agent/` and the command is run from that directory (or source the correct path).
- **50 Gwei run** – A requested run with `--with-gas-price 50gwei` failed to spawn (“Aborted”). No change was made to the repo; the user can run the same command locally.

---

## Recommended next steps

1. **Deploy from your machine** – From `skills/krumpkraft-agent/`: `set -a && . .env && set +a`, then run the full `forge script` command (with `--with-gas-price 50gwei` if desired). Let it run to completion so you see broadcast and verify result.
2. **If deploy succeeds but verify fails** – Run `forge verify-contract <DEPLOYED_ADDRESS> contracts/KrumpKraftMod.sol:KrumpKraftMod --verifier blockscout --verifier-url https://aeneid.storyscan.io/api/ --constructor-args $(cast abi-encode "constructor(address)" $USDC_K_ADDRESS) --chain 1315 --rpc-url https://aeneid.storyrpc.io`.
3. **Optional: 50 Gwei in npm script** – In `package.json`, change the `deploy:contract` script to use `--with-gas-price 50gwei` if you want that as the default.
4. **Wire swarm to contract** – Once KrumpKraftMod is deployed and verified, add `KRUMP_KRAFT_MOD_ADDRESS` to `.env` and implement sync (e.g. registerAgent on startup, throttled updatePosition from bot position).

---

*Last updated from session work: contract credits, README deploy/verify steps, test run on anvil, multiple Aeneid deploy attempts, verification and gas learnings.*
