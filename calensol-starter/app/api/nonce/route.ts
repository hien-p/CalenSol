import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  createNonceAccountInstructions,
  fetchNonce,
  getConnection,
} from '@/lib/solana/nonce';
import { PublicKey } from '@solana/web3.js';
import { isValidSolanaAddress } from '@/lib/validation/solana';
import {
  checkRateLimit,
  rateLimitedResponse,
  getClientIP,
  addSecurityHeaders,
  authenticateWallet,
} from '@/lib/auth/middleware';
import { z } from 'zod';

// Schema for creating nonce account
const CreateNonceSchema = z.object({
  walletAddress: z.string().refine(isValidSolanaAddress, 'Invalid wallet address'),
});

// GET /api/nonce - List user's nonce accounts
export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`nonce-get-${clientIP}`, 60, 60000);
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

  // Validate wallet address
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

  // Get user's nonce accounts
  const { data: nonceAccounts, error } = await supabase
    .from('nonce_accounts')
    .select('*')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch nonce accounts:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to fetch nonce accounts' }, { status: 500 })
    );
  }

  // Update current nonce values from chain
  const updatedAccounts = await Promise.all(
    (nonceAccounts || []).map(async (account) => {
      try {
        const currentNonce = await fetchNonce(new PublicKey(account.pubkey));
        return { ...account, current_nonce: currentNonce };
      } catch {
        return { ...account, is_valid: false };
      }
    })
  );

  return addSecurityHeaders(
    NextResponse.json({ nonceAccounts: updatedAccounts })
  );
}

// POST /api/nonce - Create instructions for a new nonce account
// Note: The actual creation happens client-side after signing
export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  // Rate limiting: 5 nonce creations per minute
  const rateLimit = checkRateLimit(`nonce-post-${clientIP}`, 5, 60000);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.resetAt);
  }

  try {
    const body = await request.json();
    const validationResult = CreateNonceSchema.safeParse(body);

    if (!validationResult.success) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Invalid input', details: validationResult.error.errors },
          { status: 400 }
        )
      );
    }

    const { walletAddress } = validationResult.data;

    // Authenticate
    const auth = await authenticateWallet(walletAddress);
    if (!auth.authenticated) {
      return addSecurityHeaders(
        NextResponse.json({ error: auth.error }, { status: 404 })
      );
    }

    // Check if user already has available nonce accounts
    const supabase = createAdminClient();
    const { data: existingNonces, error: fetchError } = await supabase
      .from('nonce_accounts')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('is_available', true)
      .limit(1);

    if (fetchError) {
      console.error('Failed to check existing nonces:', fetchError);
      return addSecurityHeaders(
        NextResponse.json({ error: 'Failed to check existing nonce accounts' }, { status: 500 })
      );
    }

    // If user already has available nonce accounts, return them
    if (existingNonces && existingNonces.length > 0) {
      return addSecurityHeaders(
        NextResponse.json({
          message: 'User already has available nonce accounts',
          existingCount: existingNonces.length,
        })
      );
    }

    // Create nonce account instructions
    const feePayer = new PublicKey(walletAddress);
    const { nonceKeypair, instructions } = await createNonceAccountInstructions(
      feePayer,
      feePayer // Authority is the wallet itself
    );

    // Get rent exempt amount for reference
    const connection = getConnection();
    const rentExempt = await connection.getMinimumBalanceForRentExemption(80);

    // Return instructions for client-side signing
    // The client needs to sign and send this transaction, then call POST /api/nonce/confirm
    return addSecurityHeaders(
      NextResponse.json({
        nonceAccountPubkey: nonceKeypair.publicKey.toBase58(),
        nonceAccountSecretKey: Array.from(nonceKeypair.secretKey), // Client needs this to sign
        rentExemptLamports: rentExempt,
        instructions: instructions.map((ix) => ({
          programId: ix.programId.toBase58(),
          keys: ix.keys.map((k) => ({
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(ix.data).toString('base64'),
        })),
      })
    );
  } catch (error) {
    console.error('Create nonce error:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to create nonce account instructions' }, { status: 500 })
    );
  }
}
