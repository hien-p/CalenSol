import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google';
import { createOAuthState } from '@/lib/auth/csrf';
import { isValidSolanaAddress } from '@/lib/validation/solana';
import {
  checkRateLimit,
  rateLimitedResponse,
  getClientIP,
  addSecurityHeaders,
} from '@/lib/auth/middleware';

// GET /api/auth/google - Initiate Google OAuth flow
export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request);

  // Rate limiting: 10 OAuth initiations per minute per IP
  const rateLimit = checkRateLimit(`oauth-init-${clientIP}`, 10, 60000);
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

  // Validate wallet address format
  if (!isValidSolanaAddress(walletAddress)) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 })
    );
  }

  try {
    // Create secure OAuth state (stores wallet address server-side)
    // Only the cryptographic nonce is passed to Google
    const stateNonce = await createOAuthState(walletAddress);

    // Generate OAuth URL with secure nonce (not wallet address)
    const authUrl = getAuthUrl(stateNonce);

    return addSecurityHeaders(NextResponse.json({ url: authUrl }));
  } catch (error) {
    console.error('Failed to create OAuth state:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to initiate OAuth' }, { status: 500 })
    );
  }
}
