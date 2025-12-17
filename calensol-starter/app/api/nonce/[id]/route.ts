import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchNonce, getNonceAccountInfo } from '@/lib/solana/nonce';
import { PublicKey } from '@solana/web3.js';
import { isValidSolanaAddress } from '@/lib/validation/solana';
import {
  checkRateLimit,
  rateLimitedResponse,
  getClientIP,
  addSecurityHeaders,
  authenticateWallet,
} from '@/lib/auth/middleware';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/nonce/[id] - Get a specific nonce account
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`nonce-get-id-${clientIP}`, 60, 60000);
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

  // Get nonce account
  const { data: nonceAccount, error } = await supabase
    .from('nonce_accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single();

  if (error || !nonceAccount) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Nonce account not found' }, { status: 404 })
    );
  }

  // Update current nonce from chain
  try {
    const currentNonce = await fetchNonce(new PublicKey(nonceAccount.pubkey));
    const nonceAccountInfo = await getNonceAccountInfo(new PublicKey(nonceAccount.pubkey));

    return addSecurityHeaders(
      NextResponse.json({
        nonceAccount: {
          ...nonceAccount,
          current_nonce: currentNonce,
          authority: nonceAccountInfo?.authorizedPubkey.toBase58(),
        },
      })
    );
  } catch {
    return addSecurityHeaders(
      NextResponse.json({
        nonceAccount: { ...nonceAccount, is_valid: false },
        warning: 'Could not fetch current nonce from chain',
      })
    );
  }
}

// DELETE /api/nonce/[id] - Mark nonce account as unavailable
// Note: Actual closing requires client-side transaction
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`nonce-delete-${clientIP}`, 10, 60000);
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

  // Check if nonce account exists and belongs to user
  const { data: nonceAccount, error: fetchError } = await supabase
    .from('nonce_accounts')
    .select('id, pubkey')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single();

  if (fetchError || !nonceAccount) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Nonce account not found' }, { status: 404 })
    );
  }

  // Check if nonce account is in use by any pending transactions
  const { data: pendingTx } = await supabase
    .from('scheduled_transactions')
    .select('id')
    .eq('nonce_account_id', id)
    .eq('status', 'pending')
    .limit(1);

  if (pendingTx && pendingTx.length > 0) {
    return addSecurityHeaders(
      NextResponse.json(
        { error: 'Nonce account is in use by pending transactions' },
        { status: 400 }
      )
    );
  }

  // Mark as unavailable (soft delete)
  const { error: updateError } = await supabase
    .from('nonce_accounts')
    .update({ is_available: false })
    .eq('id', id);

  if (updateError) {
    console.error('Failed to delete nonce account:', updateError);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to delete nonce account' }, { status: 500 })
    );
  }

  return addSecurityHeaders(
    NextResponse.json({
      message: 'Nonce account marked as unavailable',
      nonceAccountPubkey: nonceAccount.pubkey,
    })
  );
}
