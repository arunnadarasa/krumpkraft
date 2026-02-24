/**
 * EVVM / x402 payment adapter: relayer POST or in-process signing (no external skill dep for now)
 * Relayer mode: POST to X402_RELAYER_URL/x402/pay with receiptId, from, amount, and optional evvm sigs.
 * Native mode: build x402 + EVVM signatures and call EVVMNativeX402Adapter.payViaEVVMWithX402 (stub for now).
 * JAB (principal token) transfers use Core.pay() with EIP-191 signature (matches EVVM v3 / krumpchainstory).
 */

import { AbiCoder, JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes, getAddress } from 'ethers';

export interface EVVMAdapterConfig {
  rpcUrl: string;
  usdcKAddress: string;
  evvmCoreAddress: string;
  evvmX402AdapterAddress: string;
  privateKey: string;
  x402RelayerUrl?: string;
  /** EVVM ID (e.g. 1140 for KrumpChain). If omitted, fetched from Core.getEvvmID(). */
  evvmId?: bigint;
}

/** EVVM principal token (KRUMP / JAB) on KrumpChain EVVM */
export const PRINCIPAL_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000001';

const EVVM_CORE_ABI = [
  'function getNextCurrentSyncNonce(address user) view returns (uint256)',
  'function getIfUsedAsyncNonce(address user, uint256 nonce) view returns (bool)',
  'function getBalance(address user, address token) view returns (uint256)',
  'function getEvvmID() view returns (uint256)',
  'function pay(address from, address to_address, string to_identity, address token, uint256 amount, uint256 priorityFee, address senderExecutor, uint256 nonce, bool isAsyncExec, bytes signature) external',
];

const EVVM_ADAPTER_ABI = [
  'function payViaEVVMWithX402(address from, address to, string toIdentity, uint256 amount, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s, string receiptId, uint256 evvmNonce, bool isAsyncExec, bytes evvmSignature) external',
];

export class EVVMAdapter {
  private config: EVVMAdapterConfig;
  private provider: JsonRpcProvider;
  private wallet: Wallet;

  constructor(config: EVVMAdapterConfig) {
    this.config = config;
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.wallet = new Wallet(config.privateKey, this.provider);
  }

  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * EVVM Core internal balance for the principal token (JAB / KRUMP).
   */
  async getPrincipalBalance(userAddress: string): Promise<bigint> {
    const core = new Contract(this.config.evvmCoreAddress, EVVM_CORE_ABI, this.provider);
    return core.getBalance(userAddress, PRINCIPAL_TOKEN_ADDRESS) as Promise<bigint>;
  }

  /**
   * Transfer JAB (principal token) to another address via Core.pay().
   * Uses sync nonce; signer is also executor (wallet pays gas once).
   */
  async transferJab(params: { to: string; amount: bigint }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const { to, amount } = params;
    if (amount <= 0n) {
      return { success: false, error: 'Amount must be positive' };
    }
    const toAddress = getAddress(to);
    const coreAddress = getAddress(this.config.evvmCoreAddress);
    const from = this.wallet.address;
    const core = new Contract(this.config.evvmCoreAddress, EVVM_CORE_ABI, this.wallet);

    try {
      let evvmId = this.config.evvmId;
      if (evvmId === undefined) {
        evvmId = await core.getEvvmID() as bigint;
      }
      const nonce = await core.getNextCurrentSyncNonce(from) as bigint;
      const priorityFee = 0n;

      // Core pay hash: keccak256(abi.encode("pay", to_address, to_identity, token, amount, priorityFee))
      const coder = AbiCoder.defaultAbiCoder();
      const encoded = coder.encode(
        ['string', 'address', 'string', 'address', 'uint256', 'uint256'],
        ['pay', toAddress, '', PRINCIPAL_TOKEN_ADDRESS, amount, priorityFee]
      );
      const hashPayload = keccak256(encoded);

      // Message: evvmId,serviceAddress,hashPayload,executor,nonce,isAsyncExec (addresses lowercase)
      const message = [
        evvmId.toString(),
        coreAddress.toLowerCase(),
        hashPayload.toLowerCase(),
        from.toLowerCase(),
        nonce.toString(),
        'false',
      ].join(',');

      const signature = await this.wallet.signMessage(message);

      const tx = await core.pay(
        from,
        toAddress,
        '',
        PRINCIPAL_TOKEN_ADDRESS,
        amount,
        priorityFee,
        from,
        nonce,
        false,
        signature
      );
      const receipt = await tx.wait();
      return { success: !!receipt, txHash: receipt?.hash };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return { success: false, error: err };
    }
  }

  /**
   * Pay via x402: if X402_RELAYER_URL is set, POST to relayer; otherwise would call adapter (simplified stub).
   * Caller must have already deposited USDC.k into EVVM Treasury for native path.
   */
  async pay(params: {
    to: string;
    amount: bigint;
    receiptId: string;
  }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const { to, amount, receiptId } = params;
    if (this.config.x402RelayerUrl) {
      return this.payViaRelayer(to, amount, receiptId);
    }
    return this.payNativeStub(to, amount, receiptId);
  }

  private async payViaRelayer(
    to: string,
    amount: bigint,
    receiptId: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const url = `${this.config.x402RelayerUrl!.replace(/\/$/, '')}/x402/pay`;
    const relayerStart = Date.now();
    // #region agent log
    fetch('http://127.0.0.1:7251/ingest/61544586-8bd1-42b8-aa68-0fc167c9d6f1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'EVVMAdapter.ts:payViaRelayer', message: 'relayer_start', data: { amount: amount.toString() }, hypothesisId: 'H2', timestamp: relayerStart }) }).catch(() => {});
    // #endregion agent log
    try {
      const body = {
        receiptId: receiptId.startsWith('0x') ? receiptId : '0x' + keccak256(toUtf8Bytes(receiptId)).slice(2),
        from: this.wallet.address,
        amount: amount.toString(),
        validAfter: Math.floor(Date.now() / 1000),
        validBefore: Math.floor(Date.now() / 1000) + 3600,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; txHash?: string; error?: string };
      const relayerDuration = Date.now() - relayerStart;
      // #region agent log
      fetch('http://127.0.0.1:7251/ingest/61544586-8bd1-42b8-aa68-0fc167c9d6f1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'EVVMAdapter.ts:payViaRelayer', message: 'relayer_end', data: { durationMs: relayerDuration, ok: res.ok }, hypothesisId: 'H2', timestamp: Date.now() }) }).catch(() => {});
      // #endregion agent log
      if (!res.ok) {
        return { success: false, error: data.error || res.statusText };
      }
      return { success: !!data.ok, txHash: data.txHash };
    } catch (e) {
      const relayerDuration = Date.now() - relayerStart;
      // #region agent log
      fetch('http://127.0.0.1:7251/ingest/61544586-8bd1-42b8-aa68-0fc167c9d6f1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'EVVMAdapter.ts:payViaRelayer', message: 'relayer_error', data: { durationMs: relayerDuration }, hypothesisId: 'H2', timestamp: Date.now() }) }).catch(() => {});
      // #endregion agent log
      const err = e instanceof Error ? e.message : String(e);
      return { success: false, error: err };
    }
  }

  private async payNativeStub(
    _to: string,
    _amount: bigint,
    _receiptId: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    // Full native path would use EIP-712 x402 sign + EVVM sign + adapter.payViaEVVMWithX402.
    // For learning/build we return a clear message; integration can add openclaw-skill-usdc-dance-evvm or inline signers.
    return {
      success: false,
      error: 'Native x402 not implemented: set X402_RELAYER_URL to use Krump Verify relayer, or add payViaEVVM from openclaw-skill-usdc-dance-evvm',
    };
  }

  /**
   * Optional: deposit USDC.k into EVVM Treasury so this wallet has internal balance for native adapter.
   */
  async depositToEvvmTreasury(amount: bigint, evvmTreasuryAddress: string): Promise<{ success: boolean; txHash?: string }> {
    const { erc20Abi } = await import('../krumpverify/abis.js');
    const usdc = new Contract(this.config.usdcKAddress, erc20Abi as unknown as string[], this.wallet);
    const txApprove = await usdc.approve(evvmTreasuryAddress, amount);
    await txApprove.wait();
    const treasuryAbi = [
      'function deposit(address token, uint256 amount)',
    ];
    const treasury = new Contract(evvmTreasuryAddress, treasuryAbi, this.wallet);
    const tx = await treasury.deposit(this.config.usdcKAddress, amount);
    const receipt = await tx.wait();
    return { success: !!receipt, txHash: receipt?.hash };
  }
}
