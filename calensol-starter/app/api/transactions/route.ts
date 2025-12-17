import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createCalendarEvent, generateEventTitle } from '@/lib/calendar';
import { getValidAccessToken } from '@/lib/google';
import { z } from 'zod';
import type { CreateTransactionRequest, TransactionType } from '@/types';

// Validation schema
const CreateTransactionSchema = z.object({
  type: z.enum(['transfer', 'swap', 'stake']),
  scheduledAt: z.string().datetime(),
  amount: z.number().positive(),
  tokenMint: z.string().optional(),
  recipient: z.string().optional(),
  inputMint: z.string().optional(),
  outputMint: z.string().optional(),
  slippageBps: z.number().min(0).max(10000).optional(),
  recurrenceRule: z.string().optional(),
  memo: z.string().optional(),
});

// GET /api/transactions - List user's scheduled transactions
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const walletAddress = searchParams.get('wallet');
  const status = searchParams.get('status');

  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('smart_wallet_pubkey', walletAddress)
    .single();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  // Build query
  let query = supabase
    .from('scheduled_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('scheduled_at', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: transactions, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ transactions: transactions || [] });
}

// POST /api/transactions - Create a new scheduled transaction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, ...transactionData } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Validate input
    const data = CreateTransactionSchema.parse(transactionData);

    const supabase = createAdminClient();

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('smart_wallet_pubkey', walletAddress)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found. Please connect your Google Calendar first.' },
        { status: 404 }
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
        from_pubkey: walletAddress,
        to_pubkey: data.recipient || null,
        amount: data.amount,
        token_mint: data.tokenMint || null,
        input_mint: data.inputMint || null,
        output_mint: data.outputMint || null,
        slippage_bps: data.slippageBps || 100,
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
      return NextResponse.json(
        { error: 'Failed to create transaction' },
        { status: 500 }
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
              scheduledAt: new Date(data.scheduledAt),
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

    return NextResponse.json({
      transaction: { ...transaction, google_event_id: calendarEventId },
      calendarEventId,
    });
  } catch (error) {
    console.error('Create transaction error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper to get token symbol from mint address
function getTokenSymbol(mint?: string): string {
  if (!mint) return 'SOL';
  if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') return 'USDC';
  if (mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU') return 'USDC';
  return 'SPL';
}
