import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  NONCE_ACCOUNT_LENGTH,
  NonceAccount,
} from '@solana/web3.js';

// Get Solana connection
export function getConnection(): Connection {
  return new Connection(
    process.env.NEXT_PUBLIC_LAZORKIT_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );
}

// Create a nonce account for scheduling durable transactions
export async function createNonceAccountInstructions(
  feePayer: PublicKey,
  nonceAuthority: PublicKey
): Promise<{
  nonceKeypair: Keypair;
  instructions: TransactionInstruction[];
}> {
  const connection = getConnection();
  const nonceKeypair = Keypair.generate();

  const rentExempt = await connection.getMinimumBalanceForRentExemption(
    NONCE_ACCOUNT_LENGTH
  );

  const instructions: TransactionInstruction[] = [
    // Create nonce account
    SystemProgram.createAccount({
      fromPubkey: feePayer,
      newAccountPubkey: nonceKeypair.publicKey,
      lamports: rentExempt,
      space: NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    }),
    // Initialize nonce account
    SystemProgram.nonceInitialize({
      noncePubkey: nonceKeypair.publicKey,
      authorizedPubkey: nonceAuthority,
    }),
  ];

  return { nonceKeypair, instructions };
}

// Fetch current nonce value from account
export async function fetchNonce(nonceAccountPubkey: PublicKey): Promise<string> {
  const connection = getConnection();
  const accountInfo = await connection.getAccountInfo(nonceAccountPubkey);

  if (!accountInfo) {
    throw new Error('Nonce account not found');
  }

  const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
  return nonceAccount.nonce;
}

// Get nonce account info
export async function getNonceAccountInfo(
  nonceAccountPubkey: PublicKey
): Promise<NonceAccount | null> {
  const connection = getConnection();
  const accountInfo = await connection.getAccountInfo(nonceAccountPubkey);

  if (!accountInfo) {
    return null;
  }

  return NonceAccount.fromAccountData(accountInfo.data);
}

// Build a durable transaction using nonce
export function buildDurableTransaction(
  nonce: string,
  nonceAccountPubkey: PublicKey,
  nonceAuthority: PublicKey,
  instructions: TransactionInstruction[],
  feePayer: PublicKey
): Transaction {
  const transaction = new Transaction();

  // First instruction MUST be nonce advance
  transaction.add(
    SystemProgram.nonceAdvance({
      noncePubkey: nonceAccountPubkey,
      authorizedPubkey: nonceAuthority,
    })
  );

  // Add actual transaction instructions
  instructions.forEach((ix) => transaction.add(ix));

  // Use nonce as recent blockhash (this makes it durable)
  transaction.recentBlockhash = nonce;
  transaction.feePayer = feePayer;

  return transaction;
}

// Check if a nonce is still valid
export async function isNonceValid(
  nonceAccountPubkey: PublicKey,
  expectedNonce: string
): Promise<boolean> {
  try {
    const currentNonce = await fetchNonce(nonceAccountPubkey);
    return currentNonce === expectedNonce;
  } catch {
    return false;
  }
}

// Advance nonce (invalidates old nonce, creates new one)
export function createNonceAdvanceInstruction(
  nonceAccountPubkey: PublicKey,
  nonceAuthority: PublicKey
): TransactionInstruction {
  return SystemProgram.nonceAdvance({
    noncePubkey: nonceAccountPubkey,
    authorizedPubkey: nonceAuthority,
  });
}

// Withdraw from nonce account (to close it)
export function createNonceWithdrawInstruction(
  nonceAccountPubkey: PublicKey,
  nonceAuthority: PublicKey,
  destination: PublicKey,
  lamports: number
): TransactionInstruction {
  return SystemProgram.nonceWithdraw({
    noncePubkey: nonceAccountPubkey,
    authorizedPubkey: nonceAuthority,
    toPubkey: destination,
    lamports,
  });
}

// Serialize transaction for storage
export function serializeTransaction(transaction: Transaction): string {
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return Buffer.from(serialized).toString('base64');
}

// Deserialize transaction from storage
export function deserializeTransaction(base64Tx: string): Transaction {
  const buffer = Buffer.from(base64Tx, 'base64');
  return Transaction.from(buffer);
}

// Send a pre-signed transaction
export async function sendPresignedTransaction(
  base64Tx: string
): Promise<string> {
  const connection = getConnection();
  const txBuffer = Buffer.from(base64Tx, 'base64');

  const signature = await connection.sendRawTransaction(txBuffer, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  return signature;
}

// Confirm transaction
export async function confirmTransaction(signature: string): Promise<boolean> {
  const connection = getConnection();

  try {
    const result = await connection.confirmTransaction(signature, 'confirmed');
    return !result.value.err;
  } catch {
    return false;
  }
}

// Get transaction status
export async function getTransactionStatus(
  signature: string
): Promise<'confirmed' | 'failed' | 'pending'> {
  const connection = getConnection();

  try {
    const status = await connection.getSignatureStatus(signature);

    if (!status.value) {
      return 'pending';
    }

    if (status.value.err) {
      return 'failed';
    }

    if (
      status.value.confirmationStatus === 'confirmed' ||
      status.value.confirmationStatus === 'finalized'
    ) {
      return 'confirmed';
    }

    return 'pending';
  } catch {
    return 'pending';
  }
}
