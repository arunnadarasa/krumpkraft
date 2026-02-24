/**
 * Manages multiple KrumpKraft agents and routes messages
 */

import type { AgentConfig, AgentStatus, Commission, AgentMessage } from '../types.js';
import { KrumpKraftAgent } from '../agent/KrumpKraftAgent.js';

export class AgentSwarm {
  private agents: Map<string, KrumpKraftAgent> = new Map();
  private commissions: Commission[] = [];

  addAgent(config: AgentConfig): KrumpKraftAgent {
    const agent = new KrumpKraftAgent(config);
    this.agents.set(agent.id, agent);
    const bus = agent.getMessageBus();
    bus.setSendFn(async (msg: AgentMessage) => {
      const target = this.agents.get(msg.to);
      if (target) target.getMessageBus().deliver(msg);
    });
    return agent;
  }

  getAgent(id: string): KrumpKraftAgent | undefined {
    return this.agents.get(id);
  }

  getAgents(): KrumpKraftAgent[] {
    return Array.from(this.agents.values());
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getSwarmState(): {
    agentCount: number;
    totalBalance: bigint;
    totalIpBalance: bigint;
    totalIpNativeBalance: bigint;
    totalPrincipalBalance: bigint;
    totalTasks: number;
    totalRevenue: bigint;
    lastUpdate: number;
  } {
    const list = this.getAgents();
    let totalBalance = 0n;
    let totalIpBalance = 0n;
    let totalIpNativeBalance = 0n;
    let totalPrincipalBalance = 0n;
    let totalTasks = 0;
    let totalRevenue = 0n;
    for (const a of list) {
      const s = a.getStatus();
      totalBalance += s.balance;
      totalIpBalance += s.ipBalance ?? 0n;
      totalIpNativeBalance += s.ipNativeBalance ?? 0n;
      totalPrincipalBalance += s.principalBalance ?? 0n;
      totalTasks += s.tasksCompleted;
      totalRevenue += s.revenueGenerated;
    }
    return {
      agentCount: list.length,
      totalBalance,
      totalIpBalance,
      totalIpNativeBalance,
      totalPrincipalBalance,
      totalTasks,
      totalRevenue,
      lastUpdate: Date.now(),
    };
  }

  getAllStatus(): AgentStatus[] {
    return this.getAgents().map((a) => a.getStatus());
  }

  async refreshAllBalances(): Promise<void> {
    await Promise.all(this.getAgents().map((a) => a.refreshBalance()));
  }

  addCommission(commission: Commission): void {
    this.commissions.push(commission);
  }

  getCommissions(): Commission[] {
    return [...this.commissions];
  }

  async shutdown(): Promise<void> {
    this.agents.clear();
  }
}
