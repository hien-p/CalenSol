import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google';

// GET /api/auth/google - Initiate Google OAuth flow
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const walletAddress = searchParams.get('wallet');

  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  // Generate OAuth URL with wallet address as state
  const authUrl = getAuthUrl(walletAddress);

  return NextResponse.json({ url: authUrl });
}
