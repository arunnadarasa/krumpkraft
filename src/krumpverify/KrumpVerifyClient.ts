/**
 * Client for KrumpVerify and KrumpTreasury on Story Aeneid
 */

import { Contract, Wallet, JsonRpcProvider } from 'ethers';
import { krumpVerifyAbi, krumpTreasuryAbi, erc20Abi } from './abis.js';

export interface KrumpVerifyClientConfig {
  rpcUrl: string;
  krumpVerifyAddress: string;
  krumpTreasuryAddress?: string;
  privateKey: string;
}

export class KrumpVerifyClient {
  private provider: JsonRpcProvider;
  private signer: Wallet;
  private krumpVerify: Contract;
  private krumpTreasury: Contract | null = null;

  constructor(config: KrumpVerifyClientConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.signer = new Wallet(config.privateKey, this.provider);
    this.krumpVerify = new Contract(config.krumpVerifyAddress, krumpVerifyAbi as unknown as string[], this.signer);
    if (config.krumpTreasuryAddress) {
      this.krumpTreasury = new Contract(
        config.krumpTreasuryAddress,
        krumpTreasuryAbi as unknown as string[],
        this.signer
      );
    }
  }

  async getVerificationFee(): Promise<bigint> {
    return this.krumpVerify.verificationFee();
  }

  async getTreasuryAddress(): Promise<string> {
    return this.krumpVerify.treasury();
  }

  async verifyMove(ipId: string, moveDataHash: string, proof: string | Uint8Array): Promise<string> {
    const proofBytes = typeof proof === 'string' ? (proof.startsWith('0x') ? proof : '0x' + proof) : proof;
    const tx = await this.krumpVerify.verifyMove(ipId, moveDataHash, proofBytes);
    const receipt = await tx.wait();
    const iface = this.krumpVerify.interface;
    const log = receipt?.logs?.find((l: { address: string }) => l.address.toLowerCase() === this.krumpVerify.target?.toString().toLowerCase());
    if (log && iface) {
      const parsed = iface.parseLog({ data: log.data, topics: [...(log.topics || [])] });
      if (parsed?.args?.length) return String(parsed.args[0]);
    }
    return receipt?.hash ?? '';
  }

  async verifyMoveWithReceipt(
    ipId: string,
    moveDataHash: string,
    proof: string | Uint8Array,
    paymentReceiptId: string
  ): Promise<string> {
    const proofBytes = typeof proof === 'string' ? (proof.startsWith('0x') ? proof : '0x' + proof) : proof;
    const tx = await this.krumpVerify.verifyMoveWithReceipt(ipId, moveDataHash, proofBytes, paymentReceiptId);
    const receipt = await tx.wait();
    return receipt?.hash ?? '';
  }

  async paymentReceiptUsed(receiptId: string): Promise<boolean> {
    const [,, used] = await this.krumpVerify.paymentReceipts(receiptId);
    return !!used;
  }

  async distribute(): Promise<string> {
    if (!this.krumpTreasury) {
      const treasuryAddr = await this.getTreasuryAddress();
      this.krumpTreasury = new Contract(treasuryAddr, krumpTreasuryAbi as unknown as string[], this.signer);
    }
    const tx = await this.krumpTreasury.distribute();
    const receipt = await tx.wait();
    return receipt?.hash ?? '';
  }
}
