/**
 * Single KrumpKraft agent: Verifier, Choreographer, Miner, or Treasury
 */

import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import type { AgentConfig, AgentRole, AgentState, AgentStatus, Commission, DanceMove } from '../types.js';
import { AgentRole as RoleEnum, AgentState as StateEnum } from '../types.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { KrumpVerifyClient } from '../krumpverify/KrumpVerifyClient.js';
import { EVVMAdapter } from '../evvm/EVVMAdapter.js';
import { MessageBus } from '../messaging/MessageBus.js';
import { erc20Abi } from '../krumpverify/abis.js';
import { parseUsdcAmount, parseJabAmount } from '../utils/amounts.js';

export type CommandType = 'submitVerification' | 'commission' | 'discover' | 'distribute' | 'pay' | 'transferJab' | 'transferIp' | 'transferUsdc';

export class KrumpKraftAgent {
  readonly id: string;
  readonly name: string;
  readonly role: AgentRole;
  private memory: MemoryStore;
  private krumpVerify: KrumpVerifyClient | null = null;
  private evvm: EVVMAdapter | null = null;
  private messageBus: MessageBus;
  private state: AgentState = StateEnum.IDLE;
  private balance: bigint = 0n;
  private ipBalance: bigint = 0n;
  /** Native $IP (Story gas token) from eth_getBalance */
  private ipNativeBalance: bigint = 0n;
  /** EVVM principal token (JAB / KRUMP) from Core.getBalance */
  private principalBalance: bigint = 0n;
  private tasksCompleted: number = 0;
  private revenueGenerated: bigint = 0n;
  private provider: JsonRpcProvider | null = null;
  private wallet: Wallet | null = null;
  private usdcContract: Contract | null = null;
  private ipContract: Contract | null = null;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.memory = new MemoryStore(config.id, config.memoryPath ? undefined : './memory');
    this.messageBus = new MessageBus(config.id);
    const stored = this.memory.getOrCreate(config.id, config.name, config.role);
    this.balance = BigInt(stored.balance || '0');
    this.ipBalance = BigInt(stored.ipBalance || '0');
    this.tasksCompleted = stored.tasksCompleted;
    this.revenueGenerated = BigInt(stored.revenueGenerated || '0');
    this.state = (stored.state as AgentState) || StateEnum.IDLE;

    if (config.walletPrivateKey && config.storyRpcUrl && config.krumpVerifyAddress) {
      this.provider = new JsonRpcProvider(config.storyRpcUrl);
      this.wallet = new Wallet(config.walletPrivateKey, this.provider);
      const signer = this.wallet;
      this.krumpVerify = new KrumpVerifyClient({
        rpcUrl: config.storyRpcUrl,
        krumpVerifyAddress: config.krumpVerifyAddress,
        krumpTreasuryAddress: config.krumpTreasuryAddress,
        privateKey: config.walletPrivateKey,
      });
      if (config.usdcKAddress && config.evvmCoreAddress && config.evvmX402AdapterAddress) {
        this.evvm = new EVVMAdapter({
          rpcUrl: config.storyRpcUrl,
          usdcKAddress: config.usdcKAddress,
          evvmCoreAddress: config.evvmCoreAddress,
          evvmX402AdapterAddress: config.evvmX402AdapterAddress,
          privateKey: config.walletPrivateKey,
          x402RelayerUrl: config.x402RelayerUrl,
          evvmId: config.evvmId,
        });
      }
      if (config.usdcKAddress) {
        this.usdcContract = new Contract(config.usdcKAddress, erc20Abi as unknown as string[], signer);
      }
      if (config.ipTokenAddress) {
        this.ipContract = new Contract(config.ipTokenAddress, erc20Abi as unknown as string[], signer);
      }
    }
  }

  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  /** Wallet address for this agent (for Story API / IP assets by owner). */
  async getAddress(): Promise<string | null> {
    if (this.evvm) return this.evvm.getAddress();
    if (this.wallet) return this.wallet.getAddress();
    return null;
  }

  async refreshBalance(): Promise<void> {
    let addr: string | null = this.evvm?.getAddress() ?? null;
    if (!addr && this.wallet) addr = await this.wallet.getAddress();
    if (!addr) return;
    try {
      if (this.provider) {
        this.ipNativeBalance = await this.provider.getBalance(addr);
      }
      if (this.usdcContract) {
        this.balance = await this.usdcContract.balanceOf(addr);
      }
      if (this.ipContract) {
        this.ipBalance = await this.ipContract.balanceOf(addr);
      }
      if (this.evvm) {
        try {
          this.principalBalance = await this.evvm.getPrincipalBalance(addr);
        } catch {
          this.principalBalance = 0n;
        }
      }
      // #region agent log
      fetch('http://127.0.0.1:7251/ingest/61544586-8bd1-42b8-aa68-0fc167c9d6f1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'KrumpKraftAgent.ts:refreshBalance', message: 'USDC.k balance fetched', data: { id: this.id, balance: this.balance.toString() }, hypothesisId: 'H1', timestamp: Date.now() }) }).catch(() => {});
      // #endregion agent log
      this.memory.update({
        balance: this.balance.toString(),
        ipBalance: this.ipBalance.toString(),
        state: this.state,
        lastActive: Date.now(),
      });
    } catch {
      // ignore
    }
  }

  getStatus(): AgentStatus {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      state: this.state,
      balance: this.balance,
      ipBalance: this.ipBalance,
      ipNativeBalance: this.ipNativeBalance,
      principalBalance: this.principalBalance,
      tasksCompleted: this.tasksCompleted,
      revenueGenerated: this.revenueGenerated,
      lastActive: Date.now(),
    };
  }

  /** Recent transactions from this agent's tx log (newest first). */
  getRecentTransactions(limit = 100): Array<{ agentId: string; txHash: string; type: string; timestamp: number }> {
    const state = this.memory.load();
    const log = state?.txLog ?? [];
    return [...log].reverse().slice(0, limit).map((e) => ({ ...e, agentId: this.id }));
  }

  getState(): AgentState {
    return this.state;
  }

  getStoredPosition(): { x: number; y: number; z: number } {
    const s = this.memory.load();
    if (!s) return { x: 0, y: 64, z: 0 };
    return { x: s.x, y: s.y, z: s.z };
  }

  setPosition(x: number, y: number, z: number): void {
    this.memory.update({ x, y, z });
  }

  async runCommand(
    command: CommandType,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown }> {
    this.state = StateEnum.PROCESSING;
    this.memory.update({ state: this.state });

    try {
      let result: unknown;
      switch (command) {
        case 'submitVerification': {
          const { ipId, moveHash, proof, receiptId } = params as {
            ipId?: string;
            moveHash?: string;
            proof?: string;
            receiptId?: string;
          };
          if (!this.krumpVerify || !ipId || !moveHash) {
            return { success: false, result: { error: 'Missing ipId/moveHash or KrumpVerify not configured' } };
          }
          const proofBytes = proof ?? '0x';
          if (receiptId) {
            const txHash = await this.krumpVerify.verifyMoveWithReceipt(ipId, moveHash, proofBytes, receiptId);
            this.memory.appendTx(txHash, 'verifyMoveWithReceipt');
          } else {
            const txHash = await this.krumpVerify.verifyMove(ipId, moveHash, proofBytes);
            this.memory.appendTx(txHash, 'verifyMove');
          }
          this.tasksCompleted += 1;
          result = { txHash: 'ok' };
          break;
        }
        case 'distribute': {
          if (!this.krumpVerify) return { success: false, result: { error: 'KrumpVerify not configured' } };
          const txHash = await this.krumpVerify.distribute();
          this.memory.appendTx(txHash, 'distribute');
          result = { txHash };
          break;
        }
        case 'pay': {
          const { to, amount, receiptId } = params as { to?: string; amount?: string | number; receiptId?: string };
          if (!this.evvm) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'EVVM/x402 not configured' } };
          }
          if (!to || receiptId === undefined || receiptId === '') {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Missing to or receiptId' } };
          }
          const rawAmount = parseUsdcAmount(amount ?? 0);
          if (rawAmount <= 0n) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Amount must be positive (e.g. 0.0001)' } };
          }
          const payResult = await this.evvm.pay({ to, amount: rawAmount, receiptId });
          if (payResult.success && payResult.txHash) this.memory.appendTx(payResult.txHash, 'pay');
          result = payResult.success ? { txHash: payResult.txHash } : { error: payResult.error };
          this.state = StateEnum.IDLE;
          this.memory.update({ state: this.state, tasksCompleted: this.tasksCompleted, balance: this.balance.toString() });
          return { success: payResult.success, result };
        }
        case 'transferJab': {
          const { to, amount } = params as { to?: string; amount?: string | number };
          if (!this.evvm) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'EVVM not configured' } };
          }
          if (!to) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Missing to address' } };
          }
          const rawAmount = parseJabAmount(amount ?? 0);
          if (rawAmount <= 0n) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Amount must be positive (e.g. 1 or 0.5)' } };
          }
          if (this.principalBalance < rawAmount) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Insufficient JAB balance' } };
          }
          const transferResult = await this.evvm.transferJab({ to, amount: rawAmount });
          if (transferResult.success && transferResult.txHash) this.memory.appendTx(transferResult.txHash, 'transferJab');
          result = transferResult.success ? { txHash: transferResult.txHash } : { error: transferResult.error };
          this.state = StateEnum.IDLE;
          this.memory.update({ state: this.state, tasksCompleted: this.tasksCompleted });
          await this.refreshBalance();
          return { success: transferResult.success, result };
        }
        case 'transferIp': {
          const { to, amount } = params as { to?: string; amount?: string | number };
          if (!this.wallet) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Wallet not configured' } };
          }
          if (!to) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Missing to address' } };
          }
          const rawAmount = parseJabAmount(amount ?? 0);
          if (rawAmount <= 0n) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Amount must be positive (e.g. 0.01 or 0.5)' } };
          }
          if (this.ipNativeBalance < rawAmount) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Insufficient $IP (native) balance' } };
          }
          try {
            const tx = await this.wallet.sendTransaction({ to, value: rawAmount });
            const receipt = await tx.wait();
            if (receipt?.hash) this.memory.appendTx(receipt.hash, 'transferIp');
            result = { txHash: receipt?.hash };
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state, tasksCompleted: this.tasksCompleted });
            await this.refreshBalance();
            return { success: true, result };
          } catch (e) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            const err = e instanceof Error ? e.message : String(e);
            return { success: false, result: { error: err } };
          }
        }
        case 'transferUsdc': {
          const { to, amount } = params as { to?: string; amount?: string | number };
          if (!this.usdcContract) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'USDC.k not configured' } };
          }
          if (!to) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Missing to address' } };
          }
          const rawAmount = parseUsdcAmount(amount ?? 0);
          if (rawAmount <= 0n) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Amount must be positive (e.g. 0.0001 or 1)' } };
          }
          if (this.balance < rawAmount) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            return { success: false, result: { error: 'Insufficient USDC.k balance' } };
          }
          try {
            const tx = await this.usdcContract.transfer(to, rawAmount);
            const receipt = await tx.wait();
            if (receipt?.hash) this.memory.appendTx(receipt.hash, 'transferUsdc');
            result = { txHash: receipt?.hash };
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state, tasksCompleted: this.tasksCompleted, balance: this.balance.toString() });
            await this.refreshBalance();
            return { success: true, result };
          } catch (e) {
            this.state = StateEnum.IDLE;
            this.memory.update({ state: this.state });
            const err = e instanceof Error ? e.message : String(e);
            return { success: false, result: { error: err } };
          }
        }
        case 'commission':
        case 'discover':
          result = { message: 'Handled by swarm/API' };
          break;
        default:
          return { success: false, result: { error: `Unknown command: ${command}` } };
      }
      this.state = StateEnum.IDLE;
      this.memory.update({
        state: this.state,
        tasksCompleted: this.tasksCompleted,
        balance: this.balance.toString(),
      });
      return { success: true, result };
    } catch (e) {
      this.state = StateEnum.ERROR;
      this.memory.update({ state: this.state });
      const err = e instanceof Error ? e.message : String(e);
      return { success: false, result: { error: err } };
    }
  }
}
