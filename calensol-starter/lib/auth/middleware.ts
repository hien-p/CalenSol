import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isValidSolanaAddress } from '@/lib/validation/solana';
import { constantTimeCompare } from './wallet-signature';

/**
 * Rate limit tracking (in-memory for simplicity)
 * In production, use Redis or similar
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  walletAddress?: string;
  error?: string;
}

/**
 * Verifies the cron secret with constant-time comparison
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // IMPORTANT: Require secret to be configured
  if (!cronSecret || cronSecret.length === 0) {
    console.error('[Security] CRON_SECRET is not configured');
    return false;
  }

  if (!authHeader) {
    console.error('[Security] No authorization header provided');
    return false;
  }

  // Extract bearer token
  const expectedValue = `Bearer ${cronSecret}`;

  // Use constant-time comparison
  return constantTimeCompare(authHeader, expectedValue);
}

/**
 * Authenticates a request using wallet address from header or body
 * For now, this just validates the wallet exists in the database
 * TODO: Implement full signature verification when client supports it
 */
export async function authenticateWallet(
  walletAddress: string | null
): Promise<AuthResult> {
  if (!walletAddress) {
    return { authenticated: false, error: 'Wallet address is required' };
  }

  if (!isValidSolanaAddress(walletAddress)) {
    return { authenticated: false, error: 'Invalid wallet address format' };
  }

  const supabase = createAdminClient();

  const { data: user, error } = await supabase
    .from('users')
    .select('id, smart_wallet_pubkey')
    .eq('smart_wallet_pubkey', walletAddress)
    .single();

  if (error || !user) {
    return { authenticated: false, error: 'User not found' };
  }

  return {
    authenticated: true,
    userId: user.id,
    walletAddress: user.smart_wallet_pubkey,
  };
}

/**
 * Rate limiting check
 * @param identifier - Unique identifier (IP, wallet address, etc.)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = rateLimitMap.get(identifier);

  // Clean up or initialize
  if (!existing || now > existing.resetAt) {
    const resetAt = now + windowMs;
    rateLimitMap.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  // Increment counter
  existing.count += 1;

  if (existing.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  return {
    allowed: true,
    remaining: maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Creates a rate-limited response
 */
export function rateLimitedResponse(
  resetAt: number
): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);

  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Reset': String(resetAt),
      },
    }
  );
}

/**
 * Extracts IP address from request
 */
export function getClientIP(request: NextRequest): string {
  // Check various headers (Vercel, Cloudflare, etc.)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  return 'unknown';
}

/**
 * Standard security headers to add to responses
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * Adds security headers to a response
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
