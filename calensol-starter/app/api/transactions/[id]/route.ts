import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { deleteCalendarEvent, updateEventTime } from '@/lib/calendar';
import { getValidAccessToken } from '@/lib/google';
import { z } from 'zod';
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

// Validation schema for updates
const UpdateTransactionSchema = z.object({
  walletAddress: z.string().refine(isValidSolanaAddress, 'Invalid wallet address'),
  scheduledAt: z.string().datetime().optional(),
  amount: z.number().positive().optional(),
  recipient: z.string().optional(),
  status: z.enum(['pending', 'cancelled']).optional(),
  memo: z.string().max(256).optional(),
});

// GET /api/transactions/[id] - Get a specific transaction
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`tx-get-${clientIP}`, 100, 60000);
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

  // Get transaction
  const { data: transaction, error } = await supabase
    .from('scheduled_transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single();

  if (error || !transaction) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ transaction }));
}

// PATCH /api/transactions/[id] - Update a transaction
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`tx-patch-${clientIP}`, 30, 60000);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.resetAt);
  }

  try {
    const body = await request.json();

    // Validate input
    const validationResult = UpdateTransactionSchema.safeParse(body);
    if (!validationResult.success) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Invalid input', details: validationResult.error.errors },
          { status: 400 }
        )
      );
    }

    const { walletAddress, ...updateData } = validationResult.data;

    // Authenticate
    const auth = await authenticateWallet(walletAddress);
    if (!auth.authenticated) {
      return addSecurityHeaders(
        NextResponse.json({ error: auth.error }, { status: 404 })
      );
    }

    const supabase = createAdminClient();

    // Get user data for calendar operations
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', auth.userId)
      .single();

    // Get existing transaction
    const { data: existingTx } = await supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single();

    if (!existingTx) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      );
    }

    // Only allow updates if transaction is pending
    if (existingTx.status !== 'pending') {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Can only update pending transactions' },
          { status: 400 }
        )
      );
    }

    // Validate recipient address if provided
    if (updateData.recipient && !isValidSolanaAddress(updateData.recipient)) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 })
      );
    }

    // Validate scheduled time is in the future
    if (updateData.scheduledAt && new Date(updateData.scheduledAt) <= new Date()) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: 'Scheduled time must be in the future' },
          { status: 400 }
        )
      );
    }

    // Build update object
    const updateObj: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updateData.scheduledAt) {
      updateObj.scheduled_at = updateData.scheduledAt;
      updateObj.next_execution_at = updateData.scheduledAt;
    }
    if (updateData.amount !== undefined) updateObj.amount = updateData.amount;
    if (updateData.recipient !== undefined) updateObj.to_pubkey = updateData.recipient;
    if (updateData.status !== undefined) updateObj.status = updateData.status;
    if (updateData.memo !== undefined) updateObj.memo = updateData.memo;

    // Update transaction
    const { data: transaction, error } = await supabase
      .from('scheduled_transactions')
      .update(updateObj)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update transaction:', error);
      return addSecurityHeaders(
        NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
      );
    }

    // Update calendar event if time changed
    if (
      updateData.scheduledAt &&
      existingTx.google_event_id &&
      user?.google_refresh_token
    ) {
      try {
        const tokenData = await getValidAccessToken(
          user.google_access_token,
          user.google_refresh_token,
          user.google_token_expiry
        );

        if (tokenData) {
          await updateEventTime(
            tokenData.accessToken,
            user.google_refresh_token,
            existingTx.google_event_id,
            new Date(updateData.scheduledAt)
          );
        }
      } catch (calError) {
        console.error('Failed to update calendar event:', calError);
      }
    }

    return addSecurityHeaders(NextResponse.json({ transaction }));
  } catch (error) {
    console.error('Update transaction error:', error);

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

// DELETE /api/transactions/[id] - Cancel/delete a transaction
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const clientIP = getClientIP(request);

  // Rate limiting
  const rateLimit = checkRateLimit(`tx-delete-${clientIP}`, 20, 60000);
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

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', auth.userId)
    .single();

  // Get transaction
  const { data: transaction } = await supabase
    .from('scheduled_transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single();

  if (!transaction) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    );
  }

  // Only allow deletion if transaction is pending or failed
  if (!['pending', 'failed', 'cancelled'].includes(transaction.status)) {
    return addSecurityHeaders(
      NextResponse.json(
        { error: 'Cannot delete transaction in current status' },
        { status: 400 }
      )
    );
  }

  // Release nonce account if one was assigned
  if (transaction.nonce_account_id) {
    await supabase
      .from('nonce_accounts')
      .update({ is_available: true })
      .eq('id', transaction.nonce_account_id);
  }

  // Delete calendar event if exists
  if (transaction.google_event_id && user?.google_refresh_token) {
    try {
      const tokenData = await getValidAccessToken(
        user.google_access_token,
        user.google_refresh_token,
        user.google_token_expiry
      );

      if (tokenData) {
        await deleteCalendarEvent(
          tokenData.accessToken,
          user.google_refresh_token,
          transaction.google_event_id
        );
      }
    } catch (calError) {
      console.error('Failed to delete calendar event:', calError);
    }
  }

  // Delete transaction
  const { error } = await supabase
    .from('scheduled_transactions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete transaction:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}
