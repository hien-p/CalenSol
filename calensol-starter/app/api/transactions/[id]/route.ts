import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { deleteCalendarEvent, updateEventTime } from '@/lib/calendar';
import { getValidAccessToken } from '@/lib/google';
import { z } from 'zod';

// Validation schema for updates
const UpdateTransactionSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  amount: z.number().positive().optional(),
  recipient: z.string().optional(),
  status: z.enum(['pending', 'cancelled']).optional(),
  memo: z.string().optional(),
});

// GET /api/transactions/[id] - Get a specific transaction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const walletAddress = searchParams.get('wallet');

  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('smart_wallet_pubkey', walletAddress)
    .single();

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  // Get transaction
  const { data: transaction, error } = await supabase
    .from('scheduled_transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !transaction) {
    return NextResponse.json(
      { error: 'Transaction not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ transaction });
}

// PATCH /api/transactions/[id] - Update a transaction
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { walletAddress, ...updateData } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Validate input
    const data = UpdateTransactionSchema.parse(updateData);

    const supabase = createAdminClient();

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('smart_wallet_pubkey', walletAddress)
      .single();

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get existing transaction
    const { data: existingTx } = await supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!existingTx) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Only allow updates if transaction is pending
    if (existingTx.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only update pending transactions' },
        { status: 400 }
      );
    }

    // Build update object
    const updateObj: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.scheduledAt) {
      updateObj.scheduled_at = data.scheduledAt;
      updateObj.next_execution_at = data.scheduledAt;
    }
    if (data.amount !== undefined) updateObj.amount = data.amount;
    if (data.recipient !== undefined) updateObj.to_pubkey = data.recipient;
    if (data.status !== undefined) updateObj.status = data.status;
    if (data.memo !== undefined) updateObj.memo = data.memo;

    // Update transaction
    const { data: transaction, error } = await supabase
      .from('scheduled_transactions')
      .update(updateObj)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update transaction' },
        { status: 500 }
      );
    }

    // Update calendar event if time changed
    if (data.scheduledAt && existingTx.google_event_id && user.google_refresh_token) {
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
            new Date(data.scheduledAt)
          );
        }
      } catch (calError) {
        console.error('Failed to update calendar event:', calError);
      }
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('Update transaction error:', error);

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

// DELETE /api/transactions/[id] - Cancel/delete a transaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const walletAddress = searchParams.get('wallet');

  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('smart_wallet_pubkey', walletAddress)
    .single();

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  // Get transaction
  const { data: transaction } = await supabase
    .from('scheduled_transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!transaction) {
    return NextResponse.json(
      { error: 'Transaction not found' },
      { status: 404 }
    );
  }

  // Only allow deletion if transaction is pending or failed
  if (!['pending', 'failed', 'cancelled'].includes(transaction.status)) {
    return NextResponse.json(
      { error: 'Cannot delete transaction in current status' },
      { status: 400 }
    );
  }

  // Delete calendar event if exists
  if (transaction.google_event_id && user.google_refresh_token) {
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
    return NextResponse.json(
      { error: 'Failed to delete transaction' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
