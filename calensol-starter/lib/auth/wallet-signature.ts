import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { isValidSolanaAddress } from '@/lib/validation/solana';

/**
 * Message format for wallet signature verification
 */
export interface SignaturePayload {
  walletAddress: string;
  timestamp: number;
  nonce: string;
}

/**
 * Generates a nonce for signature verification
 */
export function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return bs58.encode(array);
}

/**
 * Creates a message to be signed by the wallet
 */
export function createSignMessage(walletAddress: string, nonce: string): string {
  const timestamp = Date.now();
  return `CalenSol Authentication\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
}

/**
 * Verifies a wallet signature
 * @param walletAddress - The public key of the signing wallet
 * @param signature - The signature in base58 format
 * @param message - The original message that was signed
 * @returns true if signature is valid
 */
export function verifyWalletSignature(
  walletAddress: string,
  signature: string,
  message: string
): boolean {
  try {
    if (!isValidSolanaAddress(walletAddress)) {
      console.error('Invalid wallet address format');
      return false;
    }

    const publicKey = new PublicKey(walletAddress);
    const signatureBytes = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);

    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Verifies a signature with timestamp validation
 * @param maxAgeMs - Maximum age of the signature in milliseconds (default 5 minutes)
 */
export function verifyTimestampedSignature(
  walletAddress: string,
  signature: string,
  message: string,
  maxAgeMs: number = 5 * 60 * 1000
): { valid: boolean; error?: string } {
  // Extract timestamp from message
  const timestampMatch = message.match(/Timestamp: (\d+)/);
  if (!timestampMatch) {
    return { valid: false, error: 'Message does not contain a valid timestamp' };
  }

  const timestamp = parseInt(timestampMatch[1], 10);
  const now = Date.now();

  // Check if timestamp is within acceptable range
  if (now - timestamp > maxAgeMs) {
    return { valid: false, error: 'Signature has expired' };
  }

  // Prevent future timestamps (with 30 second tolerance for clock drift)
  if (timestamp > now + 30000) {
    return { valid: false, error: 'Signature timestamp is in the future' };
  }

  // Verify the actual signature
  if (!verifyWalletSignature(walletAddress, signature, message)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
