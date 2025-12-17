import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchNonce, confirmTransaction } from '@/lib/solana/nonce';
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

// Schema for confirming nonce account creation
const ConfirmNonceSchema = z.object({
  walletAddress: z.string().refine(isValidSolanaAddress, 'Invalid wallet address'),
  nonceAccountPubkey: z.string().refine(isValidSolanaAddress, 'Invalid nonce account address'),
  signature: z.string().min(64, 'Invalid signature'),
});

// POST /api/nonce/confirm - Confirm nonce account creation after client-side signing
export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`nonce-confirm-${clientIP}`, 10, 60000);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.resetAt);
  }

  try {
    const body = await request.json();
    const validationResult = ConfirmNonceSchema.safeParse(body);

    if (!validationResult.success) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Invalid input', details: validationResult.error.errors },
          { status: 400 }
        )
      );
    }

    const { walletAddress, nonceAccountPubkey, signature } = validationResult.data;

    // Authenticate
    const auth = await authenticateWallet(walletAddress);
    if (!auth.authenticated) {
      return addSecurityHeaders(
        NextResponse.json({ error: auth.error }, { status: 404 })
      );
    }

    // Confirm transaction on chain
    const confirmed = await confirmTransaction(signature);
    if (!confirmed) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Transaction not confirmed' }, { status: 400 })
      );
    }

    // Fetch the nonce value
    let currentNonce: string;
    try {
      currentNonce = await fetchNonce(new PublicKey(nonceAccountPubkey));
    } catch (error) {
      console.error('Failed to fetch nonce:', error);
      return addSecurityHeaders(
        NextResponse.json({ error: 'Nonce account not found on chain' }, { status: 400 })
      );
    }

    // Store nonce account in database
    const supabase = createAdminClient();
    const { data: nonceAccount, error: insertError } = await supabase
      .from('nonce_accounts')
      .insert({
        user_id: auth.userId,
        pubkey: nonceAccountPubkey,
        authority_pubkey: walletAddress,
        current_nonce: currentNonce,
        is_available: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to store nonce account:', insertError);
      return addSecurityHeaders(
        NextResponse.json({ error: 'Failed to store nonce account' }, { status: 500 })
      );
    }

    return addSecurityHeaders(
      NextResponse.json({
        nonceAccount,
        message: 'Nonce account confirmed and stored',
      })
    );
  } catch (error) {
    console.error('Confirm nonce error:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to confirm nonce account' }, { status: 500 })
    );
  }
}
