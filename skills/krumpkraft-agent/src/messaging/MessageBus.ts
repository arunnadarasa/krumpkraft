/**
 * Agent-to-agent messaging. Thin wrapper over OpenClaw sessions_send when available.
 * For standalone use, in-memory broadcast within the swarm.
 */

import type { AgentMessage } from '../types.js';

export type SendMessageFn = (msg: AgentMessage) => Promise<void>;

export class MessageBus {
  private agentId: string;
  private handlers: Map<string, (msg: AgentMessage) => void> = new Map();
  private sendFn?: SendMessageFn;

  constructor(agentId: string, sendFn?: SendMessageFn) {
    this.agentId = agentId;
    this.sendFn = sendFn;
  }

  setSendFn(fn: SendMessageFn): void {
    this.sendFn = fn;
  }

  onMessage(handler: (msg: AgentMessage) => void): void {
    this.handlers.set(this.agentId, handler);
  }

  async send(to: string, type: AgentMessage['type'], payload: unknown): Promise<void> {
    const msg: AgentMessage = {
      from: this.agentId,
      to,
      type,
      payload,
      timestamp: Date.now(),
    };
    if (this.sendFn) {
      await this.sendFn(msg);
    }
  }

  deliver(msg: AgentMessage): void {
    const handler = this.handlers.get(msg.to);
    if (handler) handler(msg);
  }
}
