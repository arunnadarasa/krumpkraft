/**
 * Two-agent flow: Verifier + Choreographer (smoke test / demo)
 * Run with: VERIFIER_PRIVATE_KEY=0x... CHOREOGRAPHER_PRIVATE_KEY=0x... npm run example:two-agents
 */

import 'dotenv/config';
import { spawnAgentSwarm, AgentRole } from '../src/index.js';
import type { AgentConfig } from '../src/types.js';

const rpc = process.env.STORY_RPC_URL || 'https://aeneid.storyrpc.io';
const usdc = process.env.USDC_K_ADDRESS || '0xd35890acdf3BFFd445C2c7fC57231bDE5cAFbde5';
const evvmCore = process.env.EVVM_CORE_ADDRESS || '0xa6a02E8e17b819328DDB16A0ad31dD83Dd14BA3b';
const adapter = process.env.EVVM_X402_ADAPTER_ADDRESS || '0xDf5eaED856c2f8f6930d5F3A5BCE5b5d7E4C73cc';
const krumpVerify = process.env.KRUMP_VERIFY_ADDRESS || '0x41CE400d0C0f8d5c38BDf68970981b359cB5bb4A';
const relayer = process.env.X402_RELAYER_URL || '';

const configs: AgentConfig[] = [
  {
    id: 'verifier_001',
    role: AgentRole.VERIFIER,
    name: 'Dance Verifier',
    walletPrivateKey: process.env.VERIFIER_PRIVATE_KEY,
    storyRpcUrl: rpc,
    usdcKAddress: usdc,
    evvmCoreAddress: evvmCore,
    evvmX402AdapterAddress: adapter,
    krumpVerifyAddress: krumpVerify,
    x402RelayerUrl: relayer || undefined,
  },
  {
    id: 'choreographer_001',
    role: AgentRole.CHOREOGRAPHER,
    name: 'Kronos Choreographer',
    walletPrivateKey: process.env.CHOREOGRAPHER_PRIVATE_KEY,
    storyRpcUrl: rpc,
    usdcKAddress: usdc,
    evvmCoreAddress: evvmCore,
    evvmX402AdapterAddress: adapter,
    krumpVerifyAddress: krumpVerify,
    x402RelayerUrl: relayer || undefined,
  },
];

async function main() {
  const swarm = spawnAgentSwarm(configs);
  console.log('Two agents spawned:', swarm.getAgentCount());
  const state = swarm.getSwarmState();
  console.log('Swarm state:', {
    agentCount: state.agentCount,
    totalBalance: state.totalBalance.toString(),
    totalTasks: state.totalTasks,
  });
  const verifier = swarm.getAgent('verifier_001');
  if (verifier) {
    const status = verifier.getStatus();
    console.log('Verifier status:', { id: status.id, state: status.state, balance: status.balance.toString() });
  }
  console.log('Done. For full flow: deploy contracts, fund wallets, then run verifyMove or verifyMoveWithReceipt.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
