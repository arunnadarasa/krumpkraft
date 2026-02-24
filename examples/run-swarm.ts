/**
 * Start KrumpKraft swarm with API server (env-configured agents)
 * Usage: VERIFIER_PRIVATE_KEY=0x... CHOREOGRAPHER_PRIVATE_KEY=0x... npm run start:swarm
 */

import 'dotenv/config';
import { spawnSwarmWithAPIServer, AgentRole, pushBotActivity, type BotActivityEntry } from '../src/index.js';
import type { AgentConfig } from '../src/types.js';
import { startMineflayerBots } from '../src/bot/MineflayerBots.js';
import { startLLMDecisionLoop } from '../src/bot/LLMDecisionLoop.js';

const rpc = process.env.STORY_RPC_URL || 'https://aeneid.storyrpc.io';
const usdc = process.env.USDC_K_ADDRESS || '0xd35890acdf3BFFd445C2c7fC57231bDE5cAFbde5';
// WIP (Wrapped IP) on Story Aeneid per https://docs.story.foundation/developers/deployed-smart-contracts.md
const ipToken = process.env.IP_TOKEN_ADDRESS || (rpc.includes('aeneid') ? '0x1514000000000000000000000000000000000000' : '');
const evvmCore = process.env.EVVM_CORE_ADDRESS || '0xa6a02E8e17b819328DDB16A0ad31dD83Dd14BA3b';
const evvmId = process.env.EVVM_ID ? BigInt(process.env.EVVM_ID) : 1140n; // KrumpChain EVVM v3
const adapter = process.env.EVVM_X402_ADAPTER_ADDRESS || '0xDf5eaED856c2f8f6930d5F3A5BCE5b5d7E4C73cc';
const krumpVerify = process.env.KRUMP_VERIFY_ADDRESS || '0x41CE400d0C0f8d5c38BDf68970981b359cB5bb4A';
const treasury = process.env.KRUMP_TREASURY_ADDRESS || '';
const relayer = process.env.X402_RELAYER_URL || '';
const port = parseInt(process.env.API_PORT || '8081', 10);

/** Treat placeholder keys (0x, 0x , empty) as unset so swarm can start for testing without real wallets. */
function hasValidPrivateKey(key: string | undefined): boolean {
  if (!key || typeof key !== 'string') return false;
  const s = key.trim();
  return s.startsWith('0x') && /^0x[0-9a-fA-F]{64}$/.test(s);
}

const agents: AgentConfig[] = [];

if (hasValidPrivateKey(process.env.VERIFIER_PRIVATE_KEY)) {
  agents.push({
    id: 'verifier_001',
    role: AgentRole.VERIFIER,
    name: 'Krump Verifier',
    walletPrivateKey: process.env.VERIFIER_PRIVATE_KEY,
    storyRpcUrl: rpc,
    usdcKAddress: usdc,
    evvmCoreAddress: evvmCore,
    evvmX402AdapterAddress: adapter,
    krumpVerifyAddress: krumpVerify,
    krumpTreasuryAddress: treasury || undefined,
    x402RelayerUrl: relayer || undefined,
    ipTokenAddress: ipToken || undefined,
    memoryPath: undefined,
    evvmId,
  });
}
if (hasValidPrivateKey(process.env.CHOREOGRAPHER_PRIVATE_KEY)) {
  agents.push({
    id: 'choreographer_001',
    role: AgentRole.CHOREOGRAPHER,
    name: 'Kronos Choreo',
    walletPrivateKey: process.env.CHOREOGRAPHER_PRIVATE_KEY,
    storyRpcUrl: rpc,
    usdcKAddress: usdc,
    evvmCoreAddress: evvmCore,
    evvmX402AdapterAddress: adapter,
    krumpVerifyAddress: krumpVerify,
    krumpTreasuryAddress: treasury || undefined,
    x402RelayerUrl: relayer || undefined,
    ipTokenAddress: ipToken || undefined,
    memoryPath: undefined,
    evvmId,
  });
}
if (hasValidPrivateKey(process.env.MINER_PRIVATE_KEY)) {
  agents.push({
    id: 'miner_001',
    role: AgentRole.MINER,
    name: 'Miner Agent',
    walletPrivateKey: process.env.MINER_PRIVATE_KEY,
    storyRpcUrl: rpc,
    usdcKAddress: usdc,
    evvmCoreAddress: evvmCore,
    evvmX402AdapterAddress: adapter,
    krumpVerifyAddress: krumpVerify,
    krumpTreasuryAddress: treasury || undefined,
    x402RelayerUrl: relayer || undefined,
    ipTokenAddress: ipToken || undefined,
    memoryPath: undefined,
    evvmId,
  });
}
if (hasValidPrivateKey(process.env.TREASURY_PRIVATE_KEY)) {
  agents.push({
    id: 'treasury_001',
    role: AgentRole.TREASURY,
    name: 'Treasury Agent',
    walletPrivateKey: process.env.TREASURY_PRIVATE_KEY,
    storyRpcUrl: rpc,
    usdcKAddress: usdc,
    evvmCoreAddress: evvmCore,
    evvmX402AdapterAddress: adapter,
    krumpVerifyAddress: krumpVerify,
    krumpTreasuryAddress: treasury || undefined,
    x402RelayerUrl: relayer || undefined,
    ipTokenAddress: ipToken || undefined,
    memoryPath: undefined,
    evvmId,
  });
}

if (agents.length === 0) {
  console.log('No agent keys set. Set VERIFIER_PRIVATE_KEY, CHOREOGRAPHER_PRIVATE_KEY, etc.');
  agents.push({
    id: 'verifier_001',
    role: AgentRole.VERIFIER,
    name: 'Krump Verifier (no wallet)',
    memoryPath: undefined,
  });
}

const activityStore: BotActivityEntry[] = [];

async function main() {
  const { swarm } = await spawnSwarmWithAPIServer(agents, port, { activityStore });
  console.log('KrumpKraft swarm running — API on port', port);
  console.log('Agents:', swarm.getAgentCount());

  let shutdownBots: (() => void) | null = null;
  let shutdownLLM: (() => void) | null = null;
  const mcHost = process.env.MINECRAFT_HOST;
  if (mcHost) {
    const mcPort = parseInt(process.env.MINECRAFT_PORT || '25565', 10);
    let agentIds: string[] | undefined = process.env.MINECRAFT_BOT_AGENTS
      ? process.env.MINECRAFT_BOT_AGENTS.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (agentIds == null) {
      agentIds = swarm.getAgents().map((a) => a.id);
    }
    const botLimitRaw = process.env.MINECRAFT_BOT_LIMIT != null ? parseInt(process.env.MINECRAFT_BOT_LIMIT, 10) : 1;
    const botLimit = Number.isNaN(botLimitRaw) || botLimitRaw <= 0 ? agentIds.length : Math.min(botLimitRaw, agentIds.length);
    if (botLimit < agentIds.length) {
      agentIds = agentIds.slice(0, botLimit);
      console.log('Mineflayer bots limited to', botLimit, '—', agentIds.join(', '));
    }
    let requestImmediateReply: (() => void) | undefined;
    const { shutdown, bots, getRecentChat } = await startMineflayerBots(swarm, {
      host: mcHost,
      port: mcPort,
      agentIds,
      onChat: (username, message) => {
        pushBotActivity(activityStore, { type: 'chat', username, message, timestamp: Date.now() });
        if (!botUsernames.has(username)) requestImmediateReply?.();
      },
    });
    const botUsernames = new Set(Array.from(bots.keys()).map((id) => id.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 16)));
    shutdownBots = shutdown;
    console.log('Mineflayer bots connected to', mcHost + ':' + mcPort);

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey && bots.size > 0) {
      const model = process.env.LLM_MODEL || 'stepfun/step-3.5-flash:free';
      const intervalMs = parseInt(process.env.LLM_DECISION_INTERVAL_MS || '45000', 10);
      const handle = await startLLMDecisionLoop(swarm, bots, {
        openRouterApiKey: openRouterKey,
        model,
        intervalMs,
        getRecentChat,
        activityStore,
      });
      requestImmediateReply = handle.requestImmediateReply;
      shutdownLLM = handle.shutdown;
    }
  }

  process.on('SIGINT', async () => {
    if (shutdownLLM) shutdownLLM();
    if (shutdownBots) shutdownBots();
    await swarm.shutdown();
    process.exit(0);
  });
}

main().catch((e) => {
  if (e?.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other process (e.g. lsof -i :${port}, then kill <pid>) or set API_PORT to another port (e.g. API_PORT=8082 npm run start:swarm).`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
