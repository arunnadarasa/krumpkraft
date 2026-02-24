/**
 * LLM-driven decision loop for Agentic Krump Commerce.
 * Calls OpenRouter (stepfun/step-3.5-flash:free) to decide one action per tick:
 * chat (in-game message), commission (create build/class brief), or pay (USDC.k payment).
 * Executes the action via the swarm and Mineflayer bot.chat().
 */

import type { Bot } from 'mineflayer';
import type { AgentSwarm } from '../swarm/AgentSwarm.js';
import type { Commission } from '../types.js';
import { parseUsdcAmount } from '../utils/amounts.js';
import { pushBotActivity, type BotActivityEntry } from '../server/APIServer.js';
import { KRUMP_CULTURE_CONTEXT } from './krumpCultureContext.js';
import { runDanceRoutine } from './danceRoutine.js';
import type { RecentChatEntry } from './MineflayerBots.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'stepfun/step-3.5-flash:free';
const DEFAULT_INTERVAL_MS = 45_000;
/** Min ms between immediate (chat-triggered) LLM replies to avoid API spam */
const IMMEDIATE_REPLY_COOLDOWN_MS = 5_000;
/** Max entries in the in-loop memory (recent events + failures) for LLM context */
const MAX_MEMORY_ENTRIES = 25;

export interface LLMDecisionLoopOptions {
  openRouterApiKey: string;
  model?: string;
  intervalMs?: number;
  /** Last N in-game chat lines so the LLM can respond to other bots. */
  getRecentChat?: () => RecentChatEntry[];
  /** Optional store for dashboard activity feed (chat + actions). */
  activityStore?: BotActivityEntry[];
}

interface LLMAction {
  action: 'chat' | 'commission' | 'pay' | 'dance';
  agentId?: string;
  payload?: {
    message?: string;
    description?: string;
    budget?: string | number;
    to?: string;
    amount?: string | number;
    receiptId?: string;
    duration?: number;
  };
}

function buildContext(swarm: AgentSwarm): string {
  const agents = swarm.getAgents().map((a) => {
    const s = a.getStatus();
    const pos = a.getStoredPosition();
    const usdc = (Number(s.balance) / 1e6).toFixed(4);
    const jab = s.principalBalance != null ? (Number(s.principalBalance) / 1e18).toFixed(2) : '0';
    return `${a.id} (${s.name}, ${s.role}): USDC.k=${usdc}, JAB=${jab}, pos=(${pos.x},${pos.y},${pos.z})`;
  });
  const commissions = swarm.getCommissions().slice(-5).map((c: Commission) => 
    `id=${c.id} desc="${c.description}" budget=${c.budget} status=${c.status}`
  );
  return `Agents:\n${agents.join('\n')}\n\nRecent commissions:\n${commissions.join('\n') || 'none'}`;
}

function buildSystemPrompt(): string {
  return `You are part of Agentic Krump Commerce on EVVM Story. You decide ONE action per turn for a Krump agent in Minecraft.

${KRUMP_CULTURE_CONTEXT}

Reply with ONLY a single JSON object, no markdown or explanation. Valid actions:
1. chat — say something in-game (announce cypher, class, studio build, merch; reply to what others said; keep under 100 chars).
2. commission — create a commission (e.g. "Build a dance studio", "Krump class session", "Design Krump crew merch"). Needs description and budget (number, e.g. 5 or 10 for USDC.k).
3. pay — send USDC.k payment (needs to=0x address, amount e.g. 0.01, receiptId string). Only use if you have a concrete recipient and reason.
4. dance — do a short in-game dance (arm swings, jumps). Optional payload.duration (seconds, e.g. 10). Use to celebrate, respond to cypher, or hype.

Format: {"action":"chat"|"commission"|"pay"|"dance", "agentId":"<id>", "payload":{...}}
- chat: payload.message (string)
- commission: payload.description (string), payload.budget (string or number)
- pay: payload.to (string 0x...), payload.amount (string), payload.receiptId (string)
- dance: payload.duration (optional number, seconds)

You can respond to recent chat from other agents and from human players. When a player asks a question (e.g. "what is krump?"), reply in chat with a direct, helpful answer. When they greet you, greet back. Prefer chat for replying to players; use commission and dance when it fits. Use pay only when there is a clear payment reason. Use the "Recent memory" section to avoid repeating failed actions and to keep track of what just happened.`;
}

async function fetchDecision(
  apiKey: string,
  model: string,
  context: string,
  currentAgentId: string,
  getRecentChat?: () => RecentChatEntry[],
  memoryContext?: string
): Promise<LLMAction | null> {
  const chatLines = getRecentChat?.() ?? [];
  const recentChatStr = chatLines.length > 0
    ? 'Recent chat:\n' + chatLines.map((c) => `[${c.username}] ${c.message}`).join('\n')
    : 'Recent chat: none';
  const memoryStr = memoryContext && memoryContext.trim() ? `\n\nRecent memory (use to avoid repeating failures):\n${memoryContext}` : '';
  const userContent = `Current state:\n${context}\n\n${recentChatStr}${memoryStr}\n\nThis turn you are deciding for agent: ${currentAgentId}. You can reply to what others said. Your reply MUST include "agentId": "${currentAgentId}". Reply with one JSON action only.`;
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://krumpkraft.local',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userContent },
      ],
      max_tokens: 256,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  // Strip possible markdown code fence
  const raw = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(raw) as LLMAction;
  } catch {
    return null;
  }
}

export interface LLMDecisionLoopHandle {
  shutdown: () => void;
  /** Call when a human (or non-bot) chats so the LLM can reply immediately instead of waiting for the next interval. */
  requestImmediateReply: () => void;
}

type MemoryEntry = { ts: number; type: 'event' | 'failure'; agentId: string; text: string };

export async function startLLMDecisionLoop(
  swarm: AgentSwarm,
  bots: Map<string, Bot>,
  options: LLMDecisionLoopOptions
): Promise<LLMDecisionLoopHandle> {
  const { openRouterApiKey, model = DEFAULT_MODEL, intervalMs = DEFAULT_INTERVAL_MS, getRecentChat, activityStore } = options;
  const agentIds = Array.from(bots.keys());

  const memory: MemoryEntry[] = [];
  function pushMemory(agentId: string, type: MemoryEntry['type'], text: string): void {
    memory.push({ ts: Date.now(), type, agentId, text });
    if (memory.length > MAX_MEMORY_ENTRIES) memory.shift();
  }
  function getMemoryContext(): string {
    return memory.slice(-MAX_MEMORY_ENTRIES).map((e) => `- [${e.type}] ${e.agentId}: ${e.text}`).join('\n') || 'none';
  }

  let tickIndex = 0;
  let running = false;
  let lastImmediateAt = 0;

  async function runOneTick(): Promise<void> {
    if (agentIds.length === 0 || running) return;
    running = true;
    const agentId = agentIds[tickIndex % agentIds.length];
    tickIndex += 1;

    const bot = bots.get(agentId);
    const agent = swarm.getAgent(agentId);
    if (!bot || !agent) {
      running = false;
      return;
    }

    try {
      const context = buildContext(swarm);
      const decision = await fetchDecision(openRouterApiKey, model, context, agentId, getRecentChat, getMemoryContext());
      if (!decision?.action || !decision.payload) return;
      const targetAgentId = decision.agentId ?? agentId;
      if (targetAgentId !== agentId) return;
      const payload = decision.payload;

      if (decision.action === 'chat' && typeof payload.message === 'string' && payload.message.length > 0) {
        if (!bot.entity?.position) {
          console.warn(`[LLM ${targetAgentId}] skip chat — bot not in world`);
          return;
        }
        const msg = payload.message.slice(0, 256);
        bot.chat(msg);
        activityStore && pushBotActivity(activityStore, { type: 'action', action: 'chat', agentId: targetAgentId, message: msg, timestamp: Date.now() });
        console.log(`[LLM ${targetAgentId}] chat: ${msg}`);
      } else if (decision.action === 'commission' && payload.description && payload.budget != null) {
        const budget = parseUsdcAmount(payload.budget);
        if (budget > 0n) {
          const commission: Commission = {
            id: `comm_${Date.now()}`,
            choreographerId: targetAgentId,
            description: payload.description.slice(0, 200),
            budget,
            status: 'pending',
            createdAt: Date.now(),
          };
          swarm.addCommission(commission);
          if (bot) bot.chat(`New commission: ${commission.description} (budget ${payload.budget} USDC.k). ID: ${commission.id}`);
          pushMemory(targetAgentId, 'event', `commission: ${commission.description.slice(0, 40)}…`);
          activityStore && pushBotActivity(activityStore, { type: 'action', action: 'commission', agentId: targetAgentId, payload: { id: commission.id, description: commission.description, budget: String(payload.budget) }, timestamp: Date.now() });
          console.log(`[LLM ${targetAgentId}] commission: ${commission.id}`);
        }
      } else if (decision.action === 'pay' && payload.to && payload.amount != null && payload.receiptId) {
        const to = String(payload.to).trim();
        const amount = String(payload.amount);
        const receiptId = String(payload.receiptId).trim();
        if (to.startsWith('0x') && receiptId.length > 0) {
          const payAgent = swarm.getAgent(targetAgentId);
          if (!payAgent) return;
          const out = await payAgent.runCommand('pay', { to, amount, receiptId });
          const ok = out.success && out.result && typeof out.result === 'object' && 'txHash' in out.result;
          if (bot) bot.chat(ok ? `Paid ${amount} USDC.k (receipt ${receiptId}).` : `Pay failed: ${(out.result as { error?: string })?.error ?? 'unknown'}`);
          pushMemory(targetAgentId, ok ? 'event' : 'failure', ok ? `paid ${amount} USDC.k` : `pay failed: ${(out.result as { error?: string })?.error ?? 'unknown'}`);
          activityStore && pushBotActivity(activityStore, { type: 'action', action: 'pay', agentId: targetAgentId, payload: { to, amount, receiptId, success: ok }, timestamp: Date.now() });
          console.log(`[LLM ${targetAgentId}] pay: ${ok ? 'ok' : 'fail'}`);
        }
      } else if (decision.action === 'dance') {
        const durationSec = typeof payload.duration === 'number' && payload.duration > 0 ? payload.duration : 10;
        runDanceRoutine(bot, durationSec * 1000);
        bot.chat(`* ${targetAgentId} gets buck — chest pop, stomp! *`);
        pushMemory(targetAgentId, 'event', `danced ${durationSec}s`);
        activityStore && pushBotActivity(activityStore, { type: 'action', action: 'dance', agentId: targetAgentId, payload: { duration: durationSec }, timestamp: Date.now() });
        console.log(`[LLM ${targetAgentId}] dance: ${durationSec}s`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushMemory(agentId, 'failure', msg.slice(0, 80));
      console.error(`[LLM decision ${agentId}]`, msg);
    } finally {
      running = false;
    }
  }

  const interval = setInterval(runOneTick, intervalMs);

  function requestImmediateReply(): void {
    if (running) return;
    const now = Date.now();
    if (now - lastImmediateAt < IMMEDIATE_REPLY_COOLDOWN_MS) return;
    lastImmediateAt = now;
    runOneTick();
  }

  console.log(`LLM decision loop started (${model}, interval ${intervalMs}ms, immediate reply on chat)`);
  return {
    shutdown: () => clearInterval(interval),
    requestImmediateReply,
  };
}
