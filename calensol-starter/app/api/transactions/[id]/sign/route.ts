import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  fetchNonce,
  buildDurableTransaction,
  serializeTransaction,
  getConnection,
} from '@/lib/solana/nonce';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { isValidSolanaAddress } from '@/lib/validation/solana';
import {
  checkRateLimit,
  rateLimitedResponse,
  getClientIP,
  addSecurityHeaders,
  authenticateWallet,
} from '@/lib/auth/middleware';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Schema for signing request
const SignRequestSchema = z.object({
  walletAddress: z.string().refine(isValidSolanaAddress, 'Invalid wallet address'),
  presignedTxBase64: z.string().min(1, 'Pre-signed transaction is required'),
});

// POST /api/transactions/[id]/sign - Store pre-signed transaction
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`tx-sign-${clientIP}`, 10, 60000);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.resetAt);
  }

  try {
    const body = await request.json();
    const validationResult = SignRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Invalid input', details: validationResult.error.errors },
          { status: 400 }
        )
      );
    }

    const { walletAddress, presignedTxBase64 } = validationResult.data;

    // Authenticate
    const auth = await authenticateWallet(walletAddress);
    if (!auth.authenticated) {
      return addSecurityHeaders(
        NextResponse.json({ error: auth.error }, { status: 404 })
      );
    }

    const supabase = createAdminClient();

    // Get transaction
    const { data: transaction, error: txError } = await supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single();

    if (txError || !transaction) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      );
    }

    // Only allow signing for pending transactions
    if (transaction.status !== 'pending') {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Can only sign pending transactions' },
          { status: 400 }
        )
      );
    }

    // Update transaction with pre-signed data
    const { data: updatedTx, error: updateError } = await supabase
      .from('scheduled_transactions')
      .update({
        presigned_tx_base64: presignedTxBase64,
        status: 'ready', // Mark as ready for execution
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update transaction:', updateError);
      return addSecurityHeaders(
        NextResponse.json({ error: 'Failed to store pre-signed transaction' }, { status: 500 })
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        transaction: updatedTx,
        message: 'Transaction signed and ready for execution',
      })
    );
  } catch (error) {
    console.error('Sign transaction error:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to sign transaction' }, { status: 500 })
    );
  }
}

// GET /api/transactions/[id]/sign - Get unsigned transaction for signing
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`tx-sign-get-${clientIP}`, 30, 60000);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.resetAt);
  }

  const searchParams = request.nextUrl.searchParams;
  const walletAddress = searchParams.get('wallet');

  if (!walletAddress) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    );
  }

  if (!isValidSolanaAddress(walletAddress)) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    );
  }

  // Authenticate
  const auth = await authenticateWallet(walletAddress);
  if (!auth.authenticated) {
    return addSecurityHeaders(
      NextResponse.json({ error: auth.error }, { status: auth.error === 'User not found' ? 404 : 400 })
    );
  }

  const supabase = createAdminClient();

  // Get transaction
  const { data: transaction, error: txError } = await supabase
    .from('scheduled_transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single();

  if (txError || !transaction) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    );
  }

  // Only allow building for pending transactions
  if (transaction.status !== 'pending') {
    return addSecurityHeaders(
      NextResponse.json(
        { error: 'Can only build pending transactions' },
        { status: 400 }
      )
    );
  }

  try {
    // Get or assign nonce account
    let nonceAccountId = transaction.nonce_account_id;
    let nonceAccountPubkey: string;
    let currentNonce: string;

    if (!nonceAccountId) {
      // Find available nonce account
      const { data: availableNonce, error: nonceError } = await supabase
        .from('nonce_accounts')
        .select('*')
        .eq('user_id', auth.userId)
        .eq('is_available', true)
        .limit(1)
        .single();

      if (nonceError || !availableNonce) {
        return addSecurityHeaders(
          NextResponse.json(
            {
              error: 'No available nonce accounts. Please create one first.',
              code: 'NONCE_REQUIRED',
            },
            { status: 400 }
          )
        );
      }

      // Assign nonce account to transaction
      await supabase
        .from('scheduled_transactions')
        .update({ nonce_account_id: availableNonce.id })
        .eq('id', id);

      await supabase
        .from('nonce_accounts')
        .update({ is_available: false })
        .eq('id', availableNonce.id);

      nonceAccountId = availableNonce.id;
      nonceAccountPubkey = availableNonce.pubkey;
    } else {
      // Get existing nonce account
      const { data: nonceAccount } = await supabase
        .from('nonce_accounts')
        .select('pubkey')
        .eq('id', nonceAccountId)
        .single();

      if (!nonceAccount) {
        return addSecurityHeaders(
          NextResponse.json({ error: 'Nonce account not found' }, { status: 404 })
        );
      }

      nonceAccountPubkey = nonceAccount.pubkey;
    }

    // Fetch current nonce from chain
    currentNonce = await fetchNonce(new PublicKey(nonceAccountPubkey));

    // Build transaction based on type
    const fromPubkey = new PublicKey(transaction.from_pubkey);
    const connection = getConnection();

    let unsignedTxBase64: string;

    if (transaction.transaction_type === 'transfer') {
      if (!transaction.to_pubkey) {
        return addSecurityHeaders(
          NextResponse.json({ error: 'Recipient address is required' }, { status: 400 })
        );
      }

      const toPubkey = new PublicKey(transaction.to_pubkey);
      const instructions = [];

      if (!transaction.token_mint) {
        // SOL transfer
        instructions.push(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports: BigInt(transaction.amount) * BigInt(LAMPORTS_PER_SOL) / BigInt(1), // amount is in decimal SOL
          })
        );
      } else {
        // SPL Token transfer
        const mintPubkey = new PublicKey(transaction.token_mint);

        const fromAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
        const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey);

        // Check if recipient ATA exists
        try {
          await getAccount(connection, toAta);
        } catch {
          // Create ATA if it doesn't exist
          instructions.push(
            createAssociatedTokenAccountInstruction(
              fromPubkey, // payer
              toAta,
              toPubkey,
              mintPubkey
            )
          );
        }

        // Add transfer instruction
        const decimals = 6; // Assume 6 decimals for USDC
        instructions.push(
          createTransferInstruction(
            fromAta,
            toAta,
            fromPubkey,
            BigInt(Math.floor(transaction.amount * Math.pow(10, decimals))),
            [],
            TOKEN_PROGRAM_ID
          )
        );
      }

      // Build durable transaction
      const durableTx = buildDurableTransaction(
        currentNonce,
        new PublicKey(nonceAccountPubkey),
        fromPubkey, // nonce authority is the wallet
        instructions,
        fromPubkey // fee payer
      );

      unsignedTxBase64 = serializeTransaction(durableTx);
    } else {
      return addSecurityHeaders(
        NextResponse.json(
          { error: `Transaction type ${transaction.transaction_type} not yet supported for pre-signing` },
          { status: 400 }
        )
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        transaction: {
          id: transaction.id,
          type: transaction.transaction_type,
          amount: transaction.amount,
          recipient: transaction.to_pubkey,
          tokenMint: transaction.token_mint,
        },
        signingData: {
          unsignedTxBase64,
          nonceAccountPubkey,
          currentNonce,
          feePayer: transaction.from_pubkey,
        },
        message: 'Sign this transaction with your passkey',
      })
    );
  } catch (error) {
    console.error('Build transaction error:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to build transaction for signing' }, { status: 500 })
    );
  }
}
