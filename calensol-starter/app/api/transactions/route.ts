import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createCalendarEvent, generateEventTitle } from '@/lib/calendar';
import { getValidAccessToken } from '@/lib/google';
import { z } from 'zod';
import {
  createTransactionSchema,
  getTransactionsQuerySchema,
} from '@/lib/validation/schemas';
import { isValidSolanaAddress } from '@/lib/validation/solana';
import {
  checkRateLimit,
  rateLimitedResponse,
  getClientIP,
  addSecurityHeaders,
  authenticateWallet,
} from '@/lib/auth/middleware';

// GET /api/transactions - List user's scheduled transactions
export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request);

  // Rate limiting: 100 requests per minute per IP
  const rateLimit = checkRateLimit(`transactions-get-${clientIP}`, 100, 60000);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.resetAt);
  }

  const searchParams = request.nextUrl.searchParams;

  // Validate query parameters
  const queryResult = getTransactionsQuerySchema.safeParse({
    wallet: searchParams.get('wallet'),
    status: searchParams.get('status'),
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  });

  if (!queryResult.success) {
    return addSecurityHeaders(
      NextResponse.json(
        { error: 'Invalid parameters', details: queryResult.error.errors },
        { status: 400 }
      )
    );
  }

  const { wallet, status, limit, offset } = queryResult.data;

  // Authenticate wallet
  const auth = await authenticateWallet(wallet);
  if (!auth.authenticated) {
    return addSecurityHeaders(
      NextResponse.json({ error: auth.error }, { status: auth.error === 'User not found' ? 404 : 400 })
    );
  }

  const supabase = createAdminClient();

  // Build query with pagination
  let query = supabase
    .from('scheduled_transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', auth.userId)
    .order('scheduled_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: transactions, error, count } = await query;

  if (error) {
    console.error('Failed to fetch transactions:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    );
  }

  return addSecurityHeaders(
    NextResponse.json({
      transactions: transactions || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    })
  );
}

// POST /api/transactions - Create a new scheduled transaction
export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  // Rate limiting: 20 creates per minute per IP
  const rateLimit = checkRateLimit(`transactions-post-${clientIP}`, 20, 60000);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.resetAt);
  }

  try {
    const body = await request.json();

    // Validate input with comprehensive schema
    const validationResult = createTransactionSchema.safeParse(body);

    if (!validationResult.success) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Invalid input', details: validationResult.error.errors },
          { status: 400 }
        )
      );
    }

    const data = validationResult.data;

    // Additional validation for transfer type
    if (data.type === 'transfer' && !data.recipient) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Recipient address is required for transfers' },
          { status: 400 }
        )
      );
    }

    // Validate recipient address format if provided
    if (data.recipient && !isValidSolanaAddress(data.recipient)) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Invalid recipient address format' },
          { status: 400 }
        )
      );
    }

    // Validate scheduled time is in the future
    const scheduledDate = new Date(data.scheduledAt);
    if (scheduledDate <= new Date()) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Scheduled time must be in the future' },
          { status: 400 }
        )
      );
    }

    // Authenticate wallet
    const auth = await authenticateWallet(data.walletAddress);
    if (!auth.authenticated) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: auth.error || 'User not found. Please connect your Google Calendar first.' },
          { status: 404 }
        )
      );
    }

    const supabase = createAdminClient();

    // Get full user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', auth.userId)
      .single();

    if (userError || !user) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'User not found' }, { status: 404 })
      );
    }

    // Determine token symbol
    const tokenSymbol = getTokenSymbol(data.tokenMint);

    // Create transaction record
    const { data: transaction, error: txError } = await supabase
      .from('scheduled_transactions')
      .insert({
        user_id: user.id,
        transaction_type: data.type,
        scheduled_at: data.scheduledAt,
        next_execution_at: data.scheduledAt,
        from_pubkey: data.walletAddress,
        to_pubkey: data.recipient || null,
        amount: data.amount,
        token_mint: data.tokenMint || null,
        input_mint: data.inputMint || null,
        output_mint: data.outputMint || null,
        slippage_bps: data.slippageBps,
        recurrence_rule: data.recurrenceRule || null,
        status: 'pending',
        memo: data.memo || null,
        google_calendar_id: user.google_calendar_id || 'primary',
        execution_count: 0,
        retry_count: 0,
        max_retries: 3,
      })
      .select()
      .single();

    if (txError) {
      console.error('Failed to create transaction:', txError);
      return addSecurityHeaders(
        NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
      );
    }

    // Create Google Calendar event if user has connected Google
    let calendarEventId: string | undefined;

    if (user.google_refresh_token) {
      try {
        const tokenData = await getValidAccessToken(
          user.google_access_token,
          user.google_refresh_token,
          user.google_token_expiry
        );

        if (tokenData) {
          // Update stored tokens if refreshed
          if (tokenData.accessToken !== user.google_access_token) {
            await supabase
              .from('users')
              .update({
                google_access_token: tokenData.accessToken,
                google_token_expiry: tokenData.expiryDate,
              })
              .eq('id', user.id);
          }

          const eventTitle = generateEventTitle(
            data.type,
            data.amount,
            tokenSymbol,
            data.recipient
          );

          const calendarEvent = await createCalendarEvent(
            tokenData.accessToken,
            user.google_refresh_token,
            {
              title: eventTitle,
              scheduledAt: scheduledDate,
              transactionType: data.type,
              amount: data.amount,
              tokenSymbol,
              recipient: data.recipient,
              inputToken: data.inputMint ? getTokenSymbol(data.inputMint) : undefined,
              outputToken: data.outputMint ? getTokenSymbol(data.outputMint) : undefined,
            },
            transaction.id
          );

          calendarEventId = calendarEvent.id || undefined;

          // Update transaction with calendar event ID
          await supabase
            .from('scheduled_transactions')
            .update({ google_event_id: calendarEventId })
            .eq('id', transaction.id);
        }
      } catch (calError) {
        console.error('Failed to create calendar event:', calError);
        // Don't fail the whole request, calendar is optional
      }
    }

    return addSecurityHeaders(
      NextResponse.json({
        transaction: { ...transaction, google_event_id: calendarEventId },
        calendarEventId,
      })
    );
  } catch (error) {
    console.error('Create transaction error:', error);

    if (error instanceof z.ZodError) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Invalid input', details: error.errors },
          { status: 400 }
        )
      );
    }

    return addSecurityHeaders(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    );
  }
}

// Helper to get token symbol from mint address
function getTokenSymbol(mint?: string | null): string {
  if (!mint) return 'SOL';
  if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') return 'USDC';
  if (mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') return 'USDC';
  return 'SPL';
}
