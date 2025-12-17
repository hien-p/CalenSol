import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { updateEventStatus } from '@/lib/calendar';
import { getValidAccessToken } from '@/lib/google';
import {
  sendPresignedTransaction,
  confirmTransaction,
  getConnection,
} from '@/lib/solana/nonce';

// GET /api/cron/execute - Execute pending scheduled transactions
// This endpoint is called by Vercel Cron every minute
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  console.log(`[Cron] Starting execution check at ${now.toISOString()}`);

  // Get pending transactions that are due for execution
  const { data: transactions, error } = await supabase
    .from('scheduled_transactions')
    .select(
      `
      *,
      users (
        id,
        smart_wallet_pubkey,
        google_access_token,
        google_refresh_token,
        google_token_expiry
      )
    `
    )
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10); // Process in batches to avoid timeout

  if (error) {
    console.error('[Cron] Failed to fetch transactions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!transactions || transactions.length === 0) {
    console.log('[Cron] No pending transactions to execute');
    return NextResponse.json({
      message: 'No pending transactions',
      processed: 0,
    });
  }

  console.log(`[Cron] Found ${transactions.length} transactions to process`);

  const results: Array<{
    id: string;
    status: 'completed' | 'failed';
    signature?: string;
    error?: string;
  }> = [];

  for (const tx of transactions) {
    console.log(`[Cron] Processing transaction ${tx.id}`);

    try {
      // Update status to executing
      await supabase
        .from('scheduled_transactions')
        .update({ status: 'executing' })
        .eq('id', tx.id);

      // Log execution attempt
      await supabase.from('execution_logs').insert({
        transaction_id: tx.id,
        status: 'executing',
        message: 'Starting execution',
        metadata: { started_at: new Date().toISOString() },
      });

      let signature: string;

      if (tx.presigned_tx_base64) {
        // Execute pre-signed durable transaction
        console.log(`[Cron] Sending pre-signed transaction for ${tx.id}`);
        signature = await sendPresignedTransaction(tx.presigned_tx_base64);

        // Wait for confirmation
        const confirmed = await confirmTransaction(signature);

        if (!confirmed) {
          throw new Error('Transaction failed to confirm');
        }
      } else {
        // For transactions without pre-signed tx (swaps via Jupiter DCA)
        // In production, you would integrate with Jupiter DCA SDK here
        throw new Error(
          'Transaction requires pre-signed data or Jupiter DCA integration'
        );
      }

      console.log(`[Cron] Transaction ${tx.id} completed: ${signature}`);

      // Update transaction status to completed
      await supabase
        .from('scheduled_transactions')
        .update({
          status: 'completed',
          signature,
          executed_at: new Date().toISOString(),
          execution_count: tx.execution_count + 1,
        })
        .eq('id', tx.id);

      // Update Google Calendar event if connected
      if (tx.google_event_id && tx.users?.google_refresh_token) {
        try {
          const tokenData = await getValidAccessToken(
            tx.users.google_access_token,
            tx.users.google_refresh_token,
            tx.users.google_token_expiry
          );

          if (tokenData) {
            await updateEventStatus(
              tokenData.accessToken,
              tx.users.google_refresh_token,
              tx.google_event_id,
              'completed',
              signature
            );
          }
        } catch (calError) {
          console.error(
            `[Cron] Failed to update calendar for ${tx.id}:`,
            calError
          );
        }
      }

      // Log success
      await supabase.from('execution_logs').insert({
        transaction_id: tx.id,
        status: 'completed',
        message: `Transaction executed successfully`,
        metadata: { signature, executed_at: new Date().toISOString() },
      });

      results.push({ id: tx.id, status: 'completed', signature });

      // Handle recurring transactions
      if (tx.recurrence_rule) {
        const nextExecution = calculateNextExecution(
          new Date(tx.scheduled_at),
          tx.recurrence_rule
        );

        if (
          nextExecution &&
          (!tx.max_executions || tx.execution_count + 1 < tx.max_executions)
        ) {
          // Create next occurrence
          const { data: newTx, error: newTxError } = await supabase
            .from('scheduled_transactions')
            .insert({
              user_id: tx.user_id,
              transaction_type: tx.transaction_type,
              scheduled_at: nextExecution.toISOString(),
              next_execution_at: nextExecution.toISOString(),
              from_pubkey: tx.from_pubkey,
              to_pubkey: tx.to_pubkey,
              amount: tx.amount,
              token_mint: tx.token_mint,
              input_mint: tx.input_mint,
              output_mint: tx.output_mint,
              slippage_bps: tx.slippage_bps,
              recurrence_rule: tx.recurrence_rule,
              max_executions: tx.max_executions,
              execution_count: 0,
              status: 'pending',
              memo: tx.memo,
              tags: tx.tags,
              google_calendar_id: tx.google_calendar_id,
              retry_count: 0,
              max_retries: tx.max_retries,
            })
            .select()
            .single();

          if (!newTxError && newTx) {
            console.log(`[Cron] Created recurring transaction ${newTx.id}`);
          }
        }
      }
    } catch (error) {
      console.error(`[Cron] Failed to execute transaction ${tx.id}:`, error);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Check if we should retry
      const shouldRetry = tx.retry_count < tx.max_retries;

      if (shouldRetry) {
        // Update retry count, keep as pending
        await supabase
          .from('scheduled_transactions')
          .update({
            status: 'pending',
            retry_count: tx.retry_count + 1,
            error_message: errorMessage,
          })
          .eq('id', tx.id);

        console.log(
          `[Cron] Transaction ${tx.id} will retry (${tx.retry_count + 1}/${tx.max_retries})`
        );
      } else {
        // Mark as failed
        await supabase
          .from('scheduled_transactions')
          .update({
            status: 'failed',
            error_message: errorMessage,
          })
          .eq('id', tx.id);

        // Update calendar event to failed
        if (tx.google_event_id && tx.users?.google_refresh_token) {
          try {
            const tokenData = await getValidAccessToken(
              tx.users.google_access_token,
              tx.users.google_refresh_token,
              tx.users.google_token_expiry
            );

            if (tokenData) {
              await updateEventStatus(
                tokenData.accessToken,
                tx.users.google_refresh_token,
                tx.google_event_id,
                'failed'
              );
            }
          } catch (calError) {
            console.error(
              `[Cron] Failed to update calendar for ${tx.id}:`,
              calError
            );
          }
        }
      }

      // Log failure
      await supabase.from('execution_logs').insert({
        transaction_id: tx.id,
        status: shouldRetry ? 'retry' : 'failed',
        message: errorMessage,
        metadata: {
          retry_count: tx.retry_count + 1,
          max_retries: tx.max_retries,
        },
      });

      results.push({ id: tx.id, status: 'failed', error: errorMessage });
    }
  }

  console.log(`[Cron] Processed ${results.length} transactions`);

  return NextResponse.json({
    processed: results.length,
    results,
  });
}

// Calculate next execution time based on RRULE
function calculateNextExecution(
  lastExecution: Date,
  rrule: string
): Date | null {
  // Simple implementation for common patterns
  // For production, use a library like rrule-js

  const next = new Date(lastExecution);

  if (rrule.includes('FREQ=DAILY')) {
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (rrule.includes('FREQ=WEEKLY')) {
    const interval = rrule.includes('INTERVAL=2') ? 2 : 1;
    next.setDate(next.getDate() + 7 * interval);
    return next;
  }

  if (rrule.includes('FREQ=MONTHLY')) {
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  return null;
}
