import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  StakeProgram,
  Authorized,
  Lockup,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getConnection } from './nonce';

// Stake account state
export interface StakeAccountInfo {
  pubkey: PublicKey;
  lamports: number;
  state: 'inactive' | 'activating' | 'active' | 'deactivating';
  voter: PublicKey | null;
  withdrawer: PublicKey;
  staker: PublicKey;
  activationEpoch: number | null;
  deactivationEpoch: number | null;
}

// Validator info
export interface ValidatorInfo {
  votePubkey: PublicKey;
  nodePubkey: PublicKey;
  commission: number;
  activatedStake: number;
  epochCredits: number;
  name?: string;
  website?: string;
}

/**
 * Solana Staking Service
 * Provides stake account management and delegation
 */
export class StakingService {
  private connection: Connection;

  constructor(connection?: Connection) {
    this.connection = connection || getConnection();
  }

  /**
   * Create a new stake account
   */
  async createStakeAccountInstructions(
    fromPubkey: PublicKey,
    stakeLamports: number,
    stakeAuthority?: PublicKey,
    withdrawAuthority?: PublicKey
  ): Promise<{
    stakeAccountKeypair: Keypair;
    instructions: TransactionInstruction[];
  }> {
    const stakeAccountKeypair = Keypair.generate();
    const effectiveStakeAuthority = stakeAuthority || fromPubkey;
    const effectiveWithdrawAuthority = withdrawAuthority || fromPubkey;

    // Minimum stake is rent exempt + minimum delegation
    const minimumRent = await this.connection.getMinimumBalanceForRentExemption(
      StakeProgram.space
    );

    if (stakeLamports < minimumRent) {
      throw new Error(
        `Stake amount must be at least ${minimumRent / LAMPORTS_PER_SOL} SOL for rent exemption`
      );
    }

    const instructions: TransactionInstruction[] = [];

    // Create the stake account
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey,
      newAccountPubkey: stakeAccountKeypair.publicKey,
      lamports: stakeLamports,
      space: StakeProgram.space,
      programId: StakeProgram.programId,
    });

    // Initialize the stake account
    const initializeInstruction = StakeProgram.initialize({
      stakePubkey: stakeAccountKeypair.publicKey,
      authorized: new Authorized(
        effectiveStakeAuthority,
        effectiveWithdrawAuthority
      ),
      lockup: new Lockup(0, 0, fromPubkey), // No lockup
    });

    instructions.push(createAccountInstruction, initializeInstruction);

    return {
      stakeAccountKeypair,
      instructions,
    };
  }

  /**
   * Delegate stake to a validator
   */
  async delegateStakeInstructions(
    stakeAccountPubkey: PublicKey,
    stakeAuthority: PublicKey,
    validatorVotePubkey: PublicKey
  ): Promise<TransactionInstruction[]> {
    const delegateInstruction = StakeProgram.delegate({
      stakePubkey: stakeAccountPubkey,
      authorizedPubkey: stakeAuthority,
      votePubkey: validatorVotePubkey,
    });

    return [delegateInstruction];
  }

  /**
   * Create stake account and delegate in one flow
   */
  async createAndDelegateInstructions(
    fromPubkey: PublicKey,
    stakeLamports: number,
    validatorVotePubkey: PublicKey
  ): Promise<{
    stakeAccountKeypair: Keypair;
    instructions: TransactionInstruction[];
  }> {
    // Create stake account
    const { stakeAccountKeypair, instructions } =
      await this.createStakeAccountInstructions(fromPubkey, stakeLamports);

    // Add delegate instruction
    const delegateInstruction = StakeProgram.delegate({
      stakePubkey: stakeAccountKeypair.publicKey,
      authorizedPubkey: fromPubkey,
      votePubkey: validatorVotePubkey,
    });

    instructions.push(delegateInstruction);

    return {
      stakeAccountKeypair,
      instructions,
    };
  }

  /**
   * Deactivate stake (start cooldown period)
   */
  async deactivateStakeInstructions(
    stakeAccountPubkey: PublicKey,
    stakeAuthority: PublicKey
  ): Promise<TransactionInstruction[]> {
    const deactivateInstruction = StakeProgram.deactivate({
      stakePubkey: stakeAccountPubkey,
      authorizedPubkey: stakeAuthority,
    });

    return [deactivateInstruction];
  }

  /**
   * Withdraw from deactivated stake account
   */
  async withdrawStakeInstructions(
    stakeAccountPubkey: PublicKey,
    withdrawAuthority: PublicKey,
    toPubkey: PublicKey,
    lamports: number
  ): Promise<TransactionInstruction[]> {
    const withdrawInstruction = StakeProgram.withdraw({
      stakePubkey: stakeAccountPubkey,
      authorizedPubkey: withdrawAuthority,
      toPubkey,
      lamports,
    });

    return [withdrawInstruction];
  }

  /**
   * Get stake account info
   */
  async getStakeAccountInfo(
    stakeAccountPubkey: PublicKey
  ): Promise<StakeAccountInfo | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(stakeAccountPubkey);

      if (!accountInfo) {
        return null;
      }

      const stakeAccount = await this.connection.getParsedAccountInfo(
        stakeAccountPubkey
      );

      if (!stakeAccount.value?.data || typeof stakeAccount.value.data === 'string') {
        return null;
      }

      const parsed = stakeAccount.value.data.parsed;
      const info = parsed.info;
      const meta = info.meta;
      const stake = info.stake;

      let state: StakeAccountInfo['state'] = 'inactive';
      let voter: PublicKey | null = null;
      let activationEpoch: number | null = null;
      let deactivationEpoch: number | null = null;

      if (stake) {
        voter = new PublicKey(stake.delegation.voter);
        activationEpoch = stake.delegation.activationEpoch;
        deactivationEpoch = stake.delegation.deactivationEpoch;

        const epochInfo = await this.connection.getEpochInfo();

        if (deactivationEpoch !== null && deactivationEpoch <= epochInfo.epoch) {
          state = 'deactivating';
        } else if (activationEpoch !== null && activationEpoch <= epochInfo.epoch) {
          state = 'active';
        } else {
          state = 'activating';
        }
      }

      return {
        pubkey: stakeAccountPubkey,
        lamports: accountInfo.lamports,
        state,
        voter,
        withdrawer: new PublicKey(meta.authorized.withdrawer),
        staker: new PublicKey(meta.authorized.staker),
        activationEpoch,
        deactivationEpoch,
      };
    } catch (error) {
      console.error('[Staking] Failed to get stake account info:', error);
      return null;
    }
  }

  /**
   * Get all stake accounts for a user
   */
  async getUserStakeAccounts(userPubkey: PublicKey): Promise<StakeAccountInfo[]> {
    try {
      const stakeAccounts = await this.connection.getParsedProgramAccounts(
        StakeProgram.programId,
        {
          filters: [
            {
              memcmp: {
                offset: 12, // Authorized staker offset
                bytes: userPubkey.toBase58(),
              },
            },
          ],
        }
      );

      const results: StakeAccountInfo[] = [];

      for (const account of stakeAccounts) {
        const info = await this.getStakeAccountInfo(account.pubkey);
        if (info) {
          results.push(info);
        }
      }

      return results;
    } catch (error) {
      console.error('[Staking] Failed to get user stake accounts:', error);
      return [];
    }
  }

  /**
   * Get top validators by stake
   */
  async getValidators(limit: number = 20): Promise<ValidatorInfo[]> {
    try {
      const voteAccounts = await this.connection.getVoteAccounts();

      const validators = voteAccounts.current
        .sort((a, b) => b.activatedStake - a.activatedStake)
        .slice(0, limit)
        .map((v) => ({
          votePubkey: new PublicKey(v.votePubkey),
          nodePubkey: new PublicKey(v.nodePubkey),
          commission: v.commission,
          activatedStake: v.activatedStake,
          epochCredits: v.epochCredits[v.epochCredits.length - 1]?.[1] || 0,
        }));

      return validators;
    } catch (error) {
      console.error('[Staking] Failed to get validators:', error);
      return [];
    }
  }

  /**
   * Calculate estimated APY for a validator
   */
  async estimateValidatorAPY(validatorVotePubkey: PublicKey): Promise<number> {
    try {
      const epochInfo = await this.connection.getEpochInfo();
      const voteAccounts = await this.connection.getVoteAccounts();

      const validator = voteAccounts.current.find(
        (v) => v.votePubkey === validatorVotePubkey.toBase58()
      );

      if (!validator) {
        return 0;
      }

      // Simplified APY calculation
      // In production, use historical data for accuracy
      const baseAPY = 7.0; // ~7% base APY for Solana staking
      const commission = validator.commission / 100;
      const estimatedAPY = baseAPY * (1 - commission);

      return Math.round(estimatedAPY * 100) / 100;
    } catch (error) {
      console.error('[Staking] Failed to estimate APY:', error);
      return 0;
    }
  }

  /**
   * Get minimum stake amount
   */
  async getMinimumStake(): Promise<number> {
    const rentExempt = await this.connection.getMinimumBalanceForRentExemption(
      StakeProgram.space
    );
    // Minimum delegation is typically 0.01 SOL + rent
    return rentExempt + 0.01 * LAMPORTS_PER_SOL;
  }
}

// Singleton instance
let stakingService: StakingService | null = null;

export function getStakingService(): StakingService {
  if (!stakingService) {
    stakingService = new StakingService();
  }
  return stakingService;
}

/**
 * Helper to convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Helper to convert lamports to SOL
 */
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}
