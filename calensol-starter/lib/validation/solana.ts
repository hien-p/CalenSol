import { PublicKey } from '@solana/web3.js';

/**
 * Validates a Solana public key address
 * Returns true if valid, false otherwise
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Solana addresses are base58 encoded and typically 32-44 characters
  if (address.length < 32 || address.length > 44) {
    return false;
  }

  try {
    const pubkey = new PublicKey(address);
    // Verify it's on the ed25519 curve
    return PublicKey.isOnCurve(pubkey.toBytes());
  } catch {
    return false;
  }
}

/**
 * Safely creates a PublicKey from a string
 * Throws a descriptive error if invalid
 */
export function safePublicKey(address: string): PublicKey {
  if (!address || typeof address !== 'string') {
    throw new Error('Invalid address: address must be a non-empty string');
  }

  if (address.length < 32 || address.length > 44) {
    throw new Error(
      `Invalid address: expected 32-44 characters, got ${address.length}`
    );
  }

  try {
    const pubkey = new PublicKey(address);
    if (!PublicKey.isOnCurve(pubkey.toBytes())) {
      throw new Error('Invalid address: not on ed25519 curve');
    }
    return pubkey;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid address')) {
      throw error;
    }
    throw new Error(`Invalid Solana address: ${address}`);
  }
}

/**
 * Truncates a Solana address for display
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (!address || address.length < chars * 2) {
    return address;
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Common token mint addresses
 */
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC_MAINNET: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDC_DEVNET: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;

/**
 * Check if a token mint is valid
 */
export function isValidTokenMint(mint: string | null | undefined): boolean {
  if (!mint) return true; // null/undefined means SOL
  return isValidSolanaAddress(mint);
}
