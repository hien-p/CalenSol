import { NextRequest, NextResponse } from 'next/server';
import { getTokensFromCode, getUserInfo } from '@/lib/google';
import { createAdminClient } from '@/lib/supabase/server';
import { validateAndConsumeOAuthState } from '@/lib/auth/csrf';

// GET /api/auth/google/callback - Handle Google OAuth callback
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // Contains cryptographic nonce
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    console.error('OAuth error from Google:', error);
    return NextResponse.redirect(
      `${baseUrl}/dashboard?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard?error=${encodeURIComponent('No authorization code received')}`
    );
  }

  if (!state) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard?error=${encodeURIComponent('Invalid OAuth state')}`
    );
  }

  try {
    // Validate and consume OAuth state (one-time use)
    // This retrieves the wallet address stored server-side
    const walletAddress = await validateAndConsumeOAuthState(state);

    if (!walletAddress) {
      console.error('Invalid or expired OAuth state');
      return NextResponse.redirect(
        `${baseUrl}/dashboard?error=${encodeURIComponent('OAuth session expired or invalid. Please try again.')}`
      );
    }

    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Get user info from Google
    const userInfo = await getUserInfo(tokens.access_token);

    // Calculate token expiry
    const expiryDate = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString();

    // Store/update user in Supabase
    const supabase = createAdminClient();

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('smart_wallet_pubkey', walletAddress)
      .single();

    if (existingUser) {
      // Update existing user
      const { error: updateError } = await supabase
        .from('users')
        .update({
          email: userInfo.email,
          google_access_token: tokens.access_token,
          google_refresh_token: tokens.refresh_token || undefined,
          google_token_expiry: expiryDate,
          updated_at: new Date().toISOString(),
        })
        .eq('smart_wallet_pubkey', walletAddress);

      if (updateError) {
        throw updateError;
      }
    } else {
      // Create new user
      const { error: insertError } = await supabase.from('users').insert({
        email: userInfo.email,
        smart_wallet_pubkey: walletAddress,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: expiryDate,
        google_calendar_id: 'primary',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (insertError) {
        throw insertError;
      }
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?google=connected`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    const errorMessage =
      err instanceof Error ? err.message : 'OAuth authentication failed';
    return NextResponse.redirect(
      `${baseUrl}/dashboard?error=${encodeURIComponent(errorMessage)}`
    );
  }
}
