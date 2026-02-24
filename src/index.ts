/**
 * KrumpKraft OpenClaw Agent Skill
 * Exports: spawnKrumpKraftAgent, spawnAgentSwarm, spawnSwarmWithAPIServer
 */

import type { AgentConfig } from './types.js';
import { AgentRole } from './types.js';
import { KrumpKraftAgent } from './agent/KrumpKraftAgent.js';
import { AgentSwarm } from './swarm/AgentSwarm.js';
import { startAPIServer } from './server/APIServer.js';

export { AgentRole, AgentState } from './types.js';
export type { AgentConfig, AgentStatus, Commission, DanceMove, VerificationRequest, AgentMessage, BlueMapAgent } from './types.js';
export { KrumpKraftAgent } from './agent/KrumpKraftAgent.js';
export { AgentSwarm } from './swarm/AgentSwarm.js';
export { createAPIServer, startAPIServer, pushBotActivity, type BotActivityEntry, type APIServerOptions } from './server/APIServer.js';
export { MemoryStore } from './memory/MemoryStore.js';
export { KrumpVerifyClient } from './krumpverify/KrumpVerifyClient.js';
export { EVVMAdapter } from './evvm/EVVMAdapter.js';
export { MessageBus } from './messaging/MessageBus.js';

export function spawnKrumpKraftAgent(config: AgentConfig): KrumpKraftAgent {
  return new KrumpKraftAgent(config);
}

export function spawnAgentSwarm(configs: AgentConfig[]): AgentSwarm {
  const swarm = new AgentSwarm();
  for (const c of configs) swarm.addAgent(c);
  return swarm;
}

export async function spawnSwarmWithAPIServer(
  configs: AgentConfig[],
  port: number = parseInt(process.env.API_PORT || '8081', 10),
  options?: import('./server/APIServer.js').APIServerOptions
): Promise<{ swarm: AgentSwarm; server: ReturnType<import('http').Server['listen']>; app: import('express').Application }> {
  const swarm = spawnAgentSwarm(configs);
  const { server, app } = await startAPIServer(swarm, port, options);
  return { swarm, server, app };
}
