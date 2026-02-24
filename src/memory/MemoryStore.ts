/**
 * JSON file-based persistence for agent state, tasks, and tx history
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AgentState, AgentRole } from '../types.js';

export interface StoredAgentState {
  id: string;
  name: string;
  role: AgentRole;
  state: AgentState;
  balance: string;
  ipBalance?: string;
  tasksCompleted: number;
  revenueGenerated: string;
  lastActive: number;
  x: number;
  y: number;
  z: number;
  txLog: Array<{ txHash: string; type: string; timestamp: number }>;
}

const defaultState = (id: string, name: string, role: AgentRole): StoredAgentState => ({
  id,
  name,
  role,
  state: 'idle' as AgentState,
  balance: '0',
  ipBalance: '0',
  tasksCompleted: 0,
  revenueGenerated: '0',
  lastActive: Date.now(),
  x: 0,
  y: 64,
  z: 0,
  txLog: [],
});

export class MemoryStore {
  private filePath: string;
  private dir: string;

  constructor(agentId: string, memoryDir: string = './memory') {
    this.dir = path.resolve(memoryDir);
    this.filePath = path.join(this.dir, `${agentId}.json`);
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  load(): StoredAgentState | null {
    this.ensureDir();
    if (!fs.existsSync(this.filePath)) return null;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as StoredAgentState;
    } catch {
      return null;
    }
  }

  save(state: StoredAgentState): void {
    this.ensureDir();
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  getOrCreate(id: string, name: string, role: AgentRole): StoredAgentState {
    const loaded = this.load();
    if (loaded) return loaded;
    const state = defaultState(id, name, role);
    this.save(state);
    return state;
  }

  update(updates: Partial<StoredAgentState>): void {
    const current = this.load();
    if (!current) return;
    const next: StoredAgentState = { ...current, ...updates, lastActive: Date.now() };
    this.save(next);
  }

  appendTx(txHash: string, type: string): void {
    const current = this.load();
    if (!current) return;
    const txLog = [...current.txLog, { txHash, type, timestamp: Date.now() }].slice(-500);
    this.update({ txLog });
  }
}
