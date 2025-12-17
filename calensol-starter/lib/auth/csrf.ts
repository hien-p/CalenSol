import { createAdminClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

/**
 * OAuth state token structure
 */
export interface OAuthStateData {
  walletAddress: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Generates a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

/**
 * Creates a secure OAuth state token
 * The actual wallet address is stored server-side, only the nonce is passed to OAuth
 */
export async function createOAuthState(
  walletAddress: string
): Promise<string> {
  const nonce = generateSecureToken(32);
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry

  const supabase = createAdminClient();

  // Store state in database
  const { error } = await supabase.from('oauth_states').insert({
    nonce,
    wallet_address: walletAddress,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
  });

  if (error) {
    console.error('Failed to create OAuth state:', error);
    throw new Error('Failed to create OAuth state');
  }

  return nonce;
}

/**
 * Validates and consumes an OAuth state token
 * Returns the wallet address if valid, null otherwise
 */
export async function validateAndConsumeOAuthState(
  nonce: string
): Promise<string | null> {
  const supabase = createAdminClient();

  // Get and delete the state in one operation
  const { data, error } = await supabase
    .from('oauth_states')
    .select('wallet_address, expires_at')
    .eq('nonce', nonce)
    .single();

  if (error || !data) {
    console.error('OAuth state not found or already used');
    return null;
  }

  // Delete the state (one-time use)
  await supabase.from('oauth_states').delete().eq('nonce', nonce);

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    console.error('OAuth state has expired');
    return null;
  }

  return data.wallet_address;
}

/**
 * Cleans up expired OAuth states (call periodically)
 */
export async function cleanupExpiredOAuthStates(): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('oauth_states')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('Failed to cleanup OAuth states:', error);
    return 0;
  }

  return data?.length || 0;
}

/**
 * CSRF token management for forms
 */
export async function generateCSRFToken(): Promise<string> {
  const token = generateSecureToken(32);
  const cookieStore = await cookies();

  cookieStore.set('csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60, // 1 hour
    path: '/',
  });

  return token;
}

/**
 * Validates a CSRF token from request
 */
export async function validateCSRFToken(token: string): Promise<boolean> {
  const cookieStore = await cookies();
  const storedToken = cookieStore.get('csrf_token')?.value;

  if (!storedToken || !token) {
    return false;
  }

  // Constant-time comparison
  if (storedToken.length !== token.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < storedToken.length; i++) {
    result |= storedToken.charCodeAt(i) ^ token.charCodeAt(i);
  }

  return result === 0;
}
