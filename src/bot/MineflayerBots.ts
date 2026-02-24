/**
 * Mineflayer bots that connect to the Paper server and sync their in-game
 * position to the agent swarm so the mod's armor-stand markers show real bot locations.
 * Bots wander (pathfinder), collect recent chat for LLM context, and can run dance routines.
 */

import { createBot, type Bot } from 'mineflayer';
import { pathfinder, goals, Movements } from 'mineflayer-pathfinder';
import type { KrumpKraftAgent } from '../agent/KrumpKraftAgent.js';
import type { AgentSwarm } from '../swarm/AgentSwarm.js';

const POSITION_SYNC_INTERVAL_MS = 2000;
const WANDER_RADIUS = 12;
const MAX_RECENT_CHAT = 20;
/** Delay between connecting each bot to avoid server "Connection throttled" */
const BOT_CONNECT_DELAY_MS = 8000;
/** Delay before reconnecting a kicked/disconnected bot */
const RECONNECT_DELAY_MS = 25_000;

export interface RecentChatEntry {
  username: string;
  message: string;
}

/** Minecraft usernames: 3–16 chars, a-zA-Z0-9_ */
function agentIdToUsername(agentId: string): string {
  const sanitized = agentId.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 16);
  return sanitized.length >= 3 ? sanitized : agentId.substring(0, 16) || 'Bot';
}

export interface MineflayerBotsOptions {
  host: string;
  port: number;
  /** If set, only spawn bots for these agent ids. Otherwise one bot per swarm agent. */
  agentIds?: string[];
  /** Called when any in-game chat is received (for activity feed). */
  onChat?: (username: string, message: string) => void;
}

export interface MineflayerBotsResult {
  shutdown: () => void;
  /** agentId -> Mineflayer Bot (for LLM decision loop to call bot.chat etc.) */
  bots: Map<string, Bot>;
  /** Last N in-game chat messages for LLM context (bots talking to each other). */
  getRecentChat: () => RecentChatEntry[];
}

/**
 * Start Mineflayer bots for each swarm agent (or filtered by agentIds).
 * On spawn and every POSITION_SYNC_INTERVAL_MS, sync bot.entity.position to agent.setPosition.
 * Returns shutdown and a map of agentId -> bot for use by the LLM decision loop.
 */
export async function startMineflayerBots(
  swarm: AgentSwarm,
  options: MineflayerBotsOptions
): Promise<MineflayerBotsResult> {
  const { host, port, agentIds, onChat } = options;
  const agents: KrumpKraftAgent[] = agentIds
    ? agentIds.map((id) => swarm.getAgent(id)).filter((a): a is KrumpKraftAgent => a != null)
    : swarm.getAgents();

  if (agents.length === 0) {
    return { shutdown: () => {}, bots: new Map(), getRecentChat: () => [] };
  }

  const botList: { bot: Bot; agentId: string; interval: ReturnType<typeof setInterval> }[] = [];
  const botsByAgentId = new Map<string, Bot>();
  const recentChat: RecentChatEntry[] = [];
  const reconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  function syncPosition(bot: Bot, agentId: string): void {
    const agent = swarm.getAgent(agentId);
    if (!agent || !bot.entity?.position) return;
    const p = bot.entity.position;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const z = Math.floor(p.z);
    agent.setPosition(x, y, z);
  }

  function pickWanderGoal(bot: Bot): { x: number; y: number; z: number } {
    const p = bot.entity?.position;
    const bx = p ? Math.floor(p.x) : 0;
    const by = p ? Math.floor(p.y) : 64;
    const bz = p ? Math.floor(p.z) : 0;
    const x = bx + (Math.random() * 2 - 1) * WANDER_RADIUS;
    const z = bz + (Math.random() * 2 - 1) * WANDER_RADIUS;
    return { x: Math.floor(x), y: by, z: Math.floor(z) };
  }

  function startWander(bot: Bot): void {
    const pf = (bot as unknown as { pathfinder: { goto: (g: unknown) => Promise<void> } }).pathfinder;
    if (!pf) return;
    const goal = pickWanderGoal(bot);
    pf.goto(new goals.GoalBlock(goal.x, goal.y, goal.z)).then(() => {
      startWander(bot);
    }).catch(() => {
      setTimeout(() => startWander(bot), 3000);
    });
  }

  function scheduleReconnect(agentId: string): void {
    if (reconnectTimeouts.has(agentId)) return;
    const agent = swarm.getAgent(agentId) as KrumpKraftAgent | undefined;
    if (!agent) return;
    const entry = botList.find((e) => e.agentId === agentId);
    if (entry) {
      clearInterval(entry.interval);
      botList.splice(botList.indexOf(entry), 1);
      botsByAgentId.delete(agentId);
    }
    const username = agentIdToUsername(agentId);
    const timeout = setTimeout(() => {
      reconnectTimeouts.delete(agentId);
      console.log(`[Mineflayer ${username}] reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
      connectOneBot(agent, agentId, username);
    }, RECONNECT_DELAY_MS);
    reconnectTimeouts.set(agentId, timeout);
  }

  function connectOneBot(agent: KrumpKraftAgent, agentId: string, username: string): void {
    try {
      const bot = createBot({
        host,
        port,
        username,
        hideErrors: false,
      });
      bot.loadPlugin(pathfinder);

      const interval = setInterval(() => {
        if (bot.entity?.position) syncPosition(bot, agentId);
      }, POSITION_SYNC_INTERVAL_MS);
      botList.push({ bot, agentId, interval });
      botsByAgentId.set(agentId, bot);

      bot.on('chat', (who: string, msg: string) => {
        recentChat.push({ username: who, message: msg });
        if (recentChat.length > MAX_RECENT_CHAT) recentChat.shift();
        onChat?.(who, msg);
      });

      bot.once('spawn', () => {
        const movements = new Movements(bot);
        (bot as unknown as { pathfinder: { setMovements: (m: unknown) => void } }).pathfinder.setMovements(movements);
        syncPosition(bot, agentId);
        startWander(bot);
      });

      bot.on('error', (err) => {
        console.error(`[Mineflayer ${username}]`, err.message ?? err);
      });
      bot.on('kicked', (reason) => {
        console.error(`[Mineflayer ${username}] kicked:`, reason);
        scheduleReconnect(agentId);
      });
      bot.on('end', (reason) => {
        if (reason === 'disconnectCommand') return; // intentional quit (shutdown)
        console.log(`[Mineflayer ${username}] ended:`, reason);
        scheduleReconnect(agentId);
      });
    } catch (err) {
      console.error(`[Mineflayer] Failed to create bot for ${agentId}:`, err);
      scheduleReconnect(agentId);
    }
  }

  for (let i = 0; i < agents.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, BOT_CONNECT_DELAY_MS));
    }
    const agent = agents[i];
    const agentId = agent.id;
    const username = agentIdToUsername(agentId);
    connectOneBot(agent, agentId, username);
  }

  function shutdown() {
    for (const t of reconnectTimeouts.values()) clearTimeout(t);
    reconnectTimeouts.clear();
    for (const { bot, interval } of botList) {
      clearInterval(interval);
      try {
        bot.quit?.();
      } catch {
        // ignore
      }
    }
    botList.length = 0;
    botsByAgentId.clear();
  }
  function getRecentChat(): RecentChatEntry[] {
    return [...recentChat];
  }
  return { shutdown, bots: botsByAgentId, getRecentChat };
}
