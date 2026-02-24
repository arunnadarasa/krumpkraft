/**
 * KrumpKraft type definitions
 */

export enum AgentRole {
  VERIFIER = 'verifier',
  TREASURY = 'treasury',
  MINER = 'miner',
  CHOREOGRAPHER = 'choreographer',
}

export enum AgentState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  WAITING_PAYMENT = 'waiting_payment',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface AgentConfig {
  id: string;
  role: AgentRole;
  name: string;
  walletPrivateKey?: string;
  evvmCoreAddress?: string;
  krumpVerifyAddress?: string;
  krumpTreasuryAddress?: string;
  usdcKAddress?: string;
  ipTokenAddress?: string;
  x402RelayerUrl?: string;
  memoryPath?: string;
  evvmX402AdapterAddress?: string;
  storyRpcUrl?: string;
  /** EVVM ID (e.g. 1140 for KrumpChain). Optional; EVVMAdapter can fetch from Core. */
  evvmId?: bigint;
}

export interface DanceMove {
  ipId: string;
  moveHash: string;
  proof: string;
  choreographer: string;
  timestamp: number;
}

export interface VerificationRequest {
  id: string;
  move: DanceMove;
  fee: bigint;
  payer: string;
  status: 'pending' | 'paid' | 'verified' | 'rejected';
  receipt?: string;
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'payment' | 'verification' | 'commission' | 'discovery' | 'social';
  payload: unknown;
  timestamp: number;
}

export interface AgentStatus {
  id: string;
  name: string;
  role: AgentRole;
  state: AgentState;
  balance: bigint;
  ipBalance?: bigint;
  /** Native $IP (gas token) from eth_getBalance on Story */
  ipNativeBalance?: bigint;
  /** EVVM principal token (JAB / KRUMP) from Core.getBalance(user, principalToken) */
  principalBalance?: bigint;
  tasksCompleted: number;
  revenueGenerated: bigint;
  lastActive: number;
}

export interface Commission {
  id: string;
  choreographerId: string;
  description: string;
  budget: bigint;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt?: number;
}

export interface BlueMapAgent {
  id: string;
  name: string;
  role: AgentRole;
  state: AgentState;
  x: number;
  y: number;
  z: number;
}
