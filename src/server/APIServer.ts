/**
 * Express HTTP API for Minecraft mod and dashboard (ClaudeCraft-compatible patterns)
 */

import express, { Request, Response } from 'express';
import type { AgentSwarm } from '../swarm/AgentSwarm.js';
import type { AgentStatus, Commission, BlueMapAgent } from '../types.js';
import { listIPAssetsByOwner } from '../story/StoryApiClient.js';
import { parseUsdcAmount } from '../utils/amounts.js';

function serializeAgentStatus(s: AgentStatus): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    state: s.state,
    balance: s.balance.toString(),
    ipBalance: (s.ipBalance ?? 0n).toString(),
    ipNativeBalance: (s.ipNativeBalance ?? 0n).toString(),
    principalBalance: (s.principalBalance ?? 0n).toString(),
    tasksCompleted: s.tasksCompleted,
    revenueGenerated: s.revenueGenerated.toString(),
    lastActive: s.lastActive,
  };
}

function serializeSwarmState(state: { agentCount: number; totalBalance: bigint; totalIpBalance?: bigint; totalIpNativeBalance?: bigint; totalPrincipalBalance?: bigint; totalTasks: number; totalRevenue: bigint; lastUpdate: number }): Record<string, unknown> {
  return {
    agentCount: state.agentCount,
    totalBalance: state.totalBalance.toString(),
    totalIpBalance: (state.totalIpBalance ?? 0n).toString(),
    totalIpNativeBalance: (state.totalIpNativeBalance ?? 0n).toString(),
    totalPrincipalBalance: (state.totalPrincipalBalance ?? 0n).toString(),
    totalTasks: state.totalTasks,
    totalRevenue: state.totalRevenue.toString(),
    lastUpdate: state.lastUpdate,
  };
}

function serializeCommission(c: Commission): Record<string, unknown> {
  return {
    id: c.id,
    choreographerId: c.choreographerId,
    description: c.description,
    budget: c.budget.toString(),
    status: c.status,
    createdAt: c.createdAt,
    ...(c.updatedAt != null && { updatedAt: c.updatedAt }),
  };
}

function errorRes(res: Response, status: number, error: string, hint?: string): void {
  res.status(status).json({ success: false, error, ...(hint && { hint }) });
}

/** Single entry for the bots/LLM activity feed (chat + actions). */
export interface BotActivityEntry {
  id: string;
  type: 'chat' | 'action';
  timestamp: number;
  agentId?: string;
  username?: string;
  message?: string;
  action?: 'chat' | 'commission' | 'pay' | 'dance';
  payload?: Record<string, unknown>;
}

const MAX_ACTIVITY_ENTRIES = 100;

export function pushBotActivity(store: BotActivityEntry[], entry: Omit<BotActivityEntry, 'id'>): void {
  store.push({
    ...entry,
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  });
  while (store.length > MAX_ACTIVITY_ENTRIES) store.shift();
}

export function createAPIServer(
  swarm: AgentSwarm,
  port: number,
  options?: { activityStore?: BotActivityEntry[] }
): express.Application {
  const activityStore = options?.activityStore ?? [];
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-OpenClaw-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime?.(),
      agents: swarm.getAgentCount(),
    });
  });

  app.get('/status', async (_req: Request, res: Response) => {
    await swarm.refreshAllBalances();
    const state = swarm.getSwarmState();
    res.json({
      online: true,
      agents: swarm.getAllStatus().map(serializeAgentStatus),
      swarm: serializeSwarmState(state),
    });
  });

  app.get('/api/v1/agents', async (_req: Request, res: Response) => {
    await swarm.refreshAllBalances();
    const list = swarm.getAgents();
    const storyKey = process.env.STORY_API_KEY;
    const ipAssetCountByAgentId: Record<string, number> = {};
    if (storyKey) {
      const addresses = await Promise.all(list.map((a) => a.getAddress()));
      await Promise.all(
        list.map(async (agent, i) => {
          const addr = addresses[i];
          if (!addr) return;
          try {
            const r = await listIPAssetsByOwner(addr, { apiKey: storyKey });
            ipAssetCountByAgentId[agent.id] = r.total;
          } catch {
            ipAssetCountByAgentId[agent.id] = 0;
          }
        })
      );
    }
    const agents = list.map((a) => ({
      ...serializeAgentStatus(a.getStatus()),
      ...(storyKey && { ipAssetCount: ipAssetCountByAgentId[a.id] ?? 0 }),
    }));
    res.json({ agents, count: agents.length });
  });

  app.get('/api/v1/agents/:id', async (req: Request, res: Response) => {
    await swarm.refreshAllBalances();
    const agent = swarm.getAgent(req.params.id);
    if (!agent) {
      errorRes(res, 404, 'Agent not found');
      return;
    }
    res.json(serializeAgentStatus(agent.getStatus()));
  });

  app.post('/api/v1/agents/:id/command', (req: Request, res: Response) => {
    const agent = swarm.getAgent(req.params.id);
    if (!agent) {
      errorRes(res, 404, 'Agent not found');
      return;
    }
    const { command, params = {} } = req.body as { command?: string; params?: Record<string, unknown> };
    if (!command) {
      errorRes(res, 400, 'Missing command', 'Body: { command: "submitVerification"|"commission"|"discover"|"distribute"|"pay"|"transferJab"|"transferIp"|"transferUsdc", params?: {} }');
      return;
    }
    agent.runCommand(command as 'submitVerification' | 'commission' | 'discover' | 'distribute' | 'pay' | 'transferJab' | 'transferIp' | 'transferUsdc', params).then((out) => {
      res.json({ success: out.success, result: out.result });
    }).catch((e) => {
      errorRes(res, 500, e instanceof Error ? e.message : String(e));
    });
  });

  app.post('/api/v1/agents/:id/message', (req: Request, res: Response) => {
    const agent = swarm.getAgent(req.params.id);
    if (!agent) {
      errorRes(res, 404, 'Agent not found');
      return;
    }
    const { to, type, payload } = req.body as { to?: string; type?: string; payload?: unknown };
    if (!to || !type) {
      errorRes(res, 400, 'Missing to or type');
      return;
    }
    agent.getMessageBus().send(to, type as 'payment' | 'verification' | 'commission' | 'discovery' | 'social', payload ?? {}).then(() => {
      res.json({ success: true });
    }).catch((e) => {
      errorRes(res, 500, e instanceof Error ? e.message : String(e));
    });
  });

  app.get('/api/v1/swarm/state', async (_req: Request, res: Response) => {
    await swarm.refreshAllBalances();
    const list = swarm.getAgents();
    const addresses = await Promise.all(list.map((a) => a.getAddress()));
    const storyKey = process.env.STORY_API_KEY;
    const ipAssetCountByAgentId: Record<string, number> = {};
    let totalIpAssets = 0;
    if (storyKey) {
      await Promise.all(
        list.map(async (agent, i) => {
          const addr = addresses[i];
          if (!addr) return;
          try {
            const r = await listIPAssetsByOwner(addr, { apiKey: storyKey });
            ipAssetCountByAgentId[agent.id] = r.total;
            totalIpAssets += r.total;
          } catch {
            ipAssetCountByAgentId[agent.id] = 0;
          }
        })
      );
    }
    const state = swarm.getSwarmState();
    // #region agent log
    fetch('http://127.0.0.1:7251/ingest/61544586-8bd1-42b8-aa68-0fc167c9d6f1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'APIServer.ts:swarm/state', message: 'after refresh', data: { totalBalance: state.totalBalance.toString(), totalIpBalance: (state.totalIpBalance ?? 0n).toString(), totalIpNativeBalance: (state.totalIpNativeBalance ?? 0n).toString() }, hypothesisId: 'H3', timestamp: Date.now() }) }).catch(() => {});
    // #endregion agent log
    const agents = list.map((a) => ({
      ...serializeAgentStatus(a.getStatus()),
      ...(storyKey && { ipAssetCount: ipAssetCountByAgentId[a.id] ?? 0 }),
    }));
    res.json({
      swarm: {
        ...serializeSwarmState(state),
        ...(storyKey && { totalIpAssets }),
      },
      agents,
    });
  });

  app.get('/api/v1/transactions', (_req: Request, res: Response) => {
    const limit = Math.min(Number((_req.query.limit as string) || 100) || 100, 200);
    const perAgent = Math.ceil(limit / Math.max(1, swarm.getAgentCount()));
    const all = swarm.getAgents().flatMap((a) => a.getRecentTransactions(perAgent));
    all.sort((a, b) => b.timestamp - a.timestamp);
    res.json({ transactions: all.slice(0, limit) });
  });

  app.get('/api/v1/commissions', (_req: Request, res: Response) => {
    res.json({ commissions: swarm.getCommissions().map(serializeCommission) });
  });

  app.post('/api/v1/commissions', (req: Request, res: Response) => {
    const { choreographerId, description, budget } = req.body as { choreographerId?: string; description?: string; budget?: string | number };
    if (!choreographerId || description === undefined) {
      errorRes(res, 400, 'Missing choreographerId or description');
      return;
    }
    const commission: Commission = {
      id: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      choreographerId,
      description: String(description),
      budget: parseUsdcAmount(budget ?? 0),
      status: 'pending',
      createdAt: Date.now(),
    };
    swarm.addCommission(commission);
    res.json({ success: true, commission: { id: commission.id } });
  });

  app.get('/api/v1/bluemap/agents', (_req: Request, res: Response) => {
    const agents: BlueMapAgent[] = swarm.getAgents().map((a) => {
      const s = a.getStatus();
      const pos = a.getStoredPosition();
      return {
        id: s.id,
        name: s.name,
        role: s.role,
        state: s.state,
        x: pos.x,
        y: pos.y,
        z: pos.z,
      };
    });
    res.json({ agents });
  });

  app.post('/command', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const sender = (body.sender ?? body.from ?? 'Viewer') as string;
    const message = (body.message ?? body.command ?? body.text ?? '') as string;
    if (!message || String(message).trim() === '') {
      errorRes(res, 400, 'No message provided');
      return;
    }
    res.json({
      success: true,
      message: `KrumpKraft received from ${sender}: ${String(message).slice(0, 100)}`,
      note: 'Use POST /api/v1/agents/:id/command for agent actions',
    });
  });

  app.post('/minecraft/chat', async (req: Request, res: Response) => {
    const { message = '', player = 'Player' } = req.body as { message?: string; player?: string };
    const trimmed = String(message).trim();
    const replies: string[] = [];
    if (trimmed.startsWith('!')) {
      const parts = trimmed.slice(1).trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      if (cmd === 'arena' || cmd === 'help') {
        replies.push('KrumpKraft: !balance <agentId> | !commission <desc> <budget> | !pay <agentId> <to> <amount> | !usdc <agentId> <to> <amount> | !jab <agentId> <to> <amount> | !ip <agentId> <to> <amount> | !games | !join <commissionId>');
      } else if (cmd === 'balance') {
        const id = parts[1];
        if (!id) replies.push('Usage: !balance <agentId>');
        else {
          const agent = swarm.getAgent(id);
          if (!agent) replies.push(`Agent not found: ${id}`);
          else {
            const status = agent.getStatus();
            const usdcFormatted = (Number(status.balance) / 1e6).toFixed(2);
            const ipNativeRaw = status.ipNativeBalance ?? 0n;
            const ipNativeFormatted = (Number(ipNativeRaw) / 1e18).toFixed(4);
            replies.push(`Balance: ${usdcFormatted} USDC.k, $IP (native): ${ipNativeFormatted}`);
          }
        }
      } else if (cmd === 'commission') {
        const desc = parts.slice(1, -1).join(' ');
        const budget = parts[parts.length - 1];
        if (!desc || !budget) replies.push('Usage: !commission <description> <budget>');
        else {
          const commission: Commission = {
            id: `comm_${Date.now()}`,
            choreographerId: player,
            description: desc,
            budget: parseUsdcAmount(budget),
            status: 'pending',
            createdAt: Date.now(),
          };
          swarm.addCommission(commission);
          replies.push(`Commission created: ${commission.id}`);
        }
      } else if (cmd === 'games') {
        const state = swarm.getSwarmState();
        replies.push(`Agents: ${state.agentCount}, Tasks: ${state.totalTasks}`);
      } else if (cmd === 'join') {
        const id = parts[1];
        if (!id) replies.push('Usage: !join <commissionId>');
        else replies.push(`Commission ${id} join handled by miner agent`);
      } else if (cmd === 'pay') {
        const agentId = parts[1];
        const to = parts[2];
        const amount = parts[3];
        const receiptId = parts[4] || `pay_${player}_${Date.now()}`;
        if (!agentId || !to || !amount) {
          replies.push('Usage: !pay <agentId> <toAddress> <amount> [receiptId] (e.g. !pay choreographer_001 0x... 0.0001)');
        } else {
          const agent = swarm.getAgent(agentId);
          if (!agent) replies.push(`Agent not found: ${agentId}`);
          else {
            const payStart = Date.now();
            // #region agent log
            fetch('http://127.0.0.1:7251/ingest/61544586-8bd1-42b8-aa68-0fc167c9d6f1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'APIServer.ts:minecraft/chat pay', message: 'pay_start', data: { agentId, amount }, hypothesisId: 'H1', timestamp: payStart }) }).catch(() => {});
            // #endregion agent log
            try {
              const out = await agent.runCommand('pay', { to, amount, receiptId });
              const payDuration = Date.now() - payStart;
              // #region agent log
              fetch('http://127.0.0.1:7251/ingest/61544586-8bd1-42b8-aa68-0fc167c9d6f1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'APIServer.ts:minecraft/chat pay', message: 'pay_end', data: { success: out.success, durationMs: payDuration }, hypothesisId: 'H3', timestamp: Date.now() }) }).catch(() => {});
              // #endregion agent log
              if (out.success && out.result && typeof out.result === 'object' && 'txHash' in out.result) {
                replies.push(`Payment sent. Tx: ${(out.result as { txHash?: string }).txHash}`);
              } else {
                const err = out.result && typeof out.result === 'object' && 'error' in out.result ? (out.result as { error: string }).error : 'Payment failed';
                replies.push(`Pay failed: ${err}`);
              }
            } catch (e) {
              const payDuration = Date.now() - payStart;
              // #region agent log
              fetch('http://127.0.0.1:7251/ingest/61544586-8bd1-42b8-aa68-0fc167c9d6f1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'APIServer.ts:minecraft/chat pay', message: 'pay_error', data: { durationMs: payDuration, error: e instanceof Error ? e.message : String(e) }, hypothesisId: 'H3', timestamp: Date.now() }) }).catch(() => {});
              // #endregion agent log
              replies.push(`Pay error: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      } else if (cmd === 'jab' || cmd === 'transferjab') {
        const agentId = parts[1];
        const to = parts[2];
        const amount = parts[3];
        if (!agentId || !to || !amount) {
          replies.push('Usage: !jab <agentId> <toAddress> <amount> (e.g. !jab choreographer_001 0x... 1.5)');
        } else {
          const agent = swarm.getAgent(agentId);
          if (!agent) replies.push(`Agent not found: ${agentId}`);
          else {
            try {
              const out = await agent.runCommand('transferJab', { to, amount });
              if (out.success && out.result && typeof out.result === 'object' && 'txHash' in out.result) {
                replies.push(`JAB sent. Tx: ${(out.result as { txHash?: string }).txHash}`);
              } else {
                const err = out.result && typeof out.result === 'object' && 'error' in out.result ? (out.result as { error: string }).error : 'Transfer failed';
                replies.push(`JAB failed: ${err}`);
              }
            } catch (e) {
              replies.push(`JAB error: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      } else if (cmd === 'ip' || cmd === 'payip') {
        const agentId = parts[1];
        const to = parts[2];
        const amount = parts[3];
        if (!agentId || !to || !amount) {
          replies.push('Usage: !ip <agentId> <toAddress> <amount> (e.g. !ip choreographer_001 0x... 0.01) — sends native $IP');
        } else {
          const agent = swarm.getAgent(agentId);
          if (!agent) replies.push(`Agent not found: ${agentId}`);
          else {
            try {
              const out = await agent.runCommand('transferIp', { to, amount });
              if (out.success && out.result && typeof out.result === 'object' && 'txHash' in out.result) {
                replies.push(`$IP sent. Tx: ${(out.result as { txHash?: string }).txHash}`);
              } else {
                const err = out.result && typeof out.result === 'object' && 'error' in out.result ? (out.result as { error: string }).error : 'Transfer failed';
                replies.push(`$IP failed: ${err}`);
              }
            } catch (e) {
              replies.push(`$IP error: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      } else if (cmd === 'usdc' || cmd === 'payusdc') {
        const agentId = parts[1];
        const to = parts[2];
        const amount = parts[3];
        if (!agentId || !to || !amount) {
          replies.push('Usage: !usdc <agentId> <toAddress> <amount> (e.g. !usdc choreographer_001 0x... 0.5)');
        } else {
          const agent = swarm.getAgent(agentId);
          if (!agent) replies.push(`Agent not found: ${agentId}`);
          else {
            try {
              const out = await agent.runCommand('transferUsdc', { to, amount });
              if (out.success && out.result && typeof out.result === 'object' && 'txHash' in out.result) {
                replies.push(`USDC.k sent. Tx: ${(out.result as { txHash?: string }).txHash}`);
              } else {
                const err = out.result && typeof out.result === 'object' && 'error' in out.result ? (out.result as { error: string }).error : 'Transfer failed';
                replies.push(`USDC.k failed: ${err}`);
              }
            } catch (e) {
              replies.push(`USDC.k error: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      } else {
        replies.push('Unknown command. Use !arena for help.');
      }
    } else {
      replies.push(`Hi ${player}! Say !arena for KrumpKraft commands.`);
    }
    res.json(replies.length === 1 ? { reply: replies[0] } : { replies });
  });

  app.get('/api/v1/activity', (_req: Request, res: Response) => {
    const activity = [...activityStore].sort((a, b) => b.timestamp - a.timestamp);
    res.json({ activity });
  });

  app.get('/api/v1/discover', (_req: Request, res: Response) => {
    res.json({
      name: 'KrumpKraft API',
      version: '0.1.0',
      description: 'Agentic Krump Commerce on EVVM Story. Verifier, Choreographer, Miner, Treasury agents.',
      base_url: '/api/v1',
      endpoints: {
        'GET /health': { description: 'Health check', auth: 'none' },
        'GET /api/v1/activity': { description: 'Bots & LLM activity feed (chat + actions)', auth: 'none' },
        'GET /api/v1/agents': { description: 'List agents', auth: 'none' },
        'GET /api/v1/agents/:id': { description: 'Agent status', auth: 'none' },
        'POST /api/v1/agents/:id/command': { description: 'Run agent command', auth: 'optional' },
        'GET /api/v1/swarm/state': { description: 'Swarm state', auth: 'none' },
        'GET /api/v1/transactions': { description: 'Recent transactions (all agents)', auth: 'none' },
        'GET /api/v1/commissions': { description: 'List commissions', auth: 'none' },
        'POST /api/v1/commissions': { description: 'Create commission', auth: 'none' },
        'GET /api/v1/bluemap/agents': { description: 'Agent positions for BlueMap', auth: 'none' },
        'POST /command': { description: 'ClaudeCraft-style webhook', auth: 'none' },
        'POST /minecraft/chat': { description: 'In-game chat parser', auth: 'none' },
      },
      getting_started: [
        '1. GET /health to check API',
        '2. GET /api/v1/agents to see agents',
        '3. POST /api/v1/agents/:id/command with command and params',
      ],
    });
  });

  return app;
}

export interface APIServerOptions {
  activityStore?: BotActivityEntry[];
}

export function startAPIServer(
  swarm: AgentSwarm,
  port: number,
  options?: APIServerOptions
): Promise<{ server: ReturnType<express.Application['listen']>; app: express.Application }> {
  const app = createAPIServer(swarm, port, options);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`KrumpKraft API listening on port ${port}`);
      resolve({ server, app });
    });
    server.once('error', reject);
  });
}
