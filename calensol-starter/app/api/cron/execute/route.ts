import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { updateEventStatus } from '@/lib/calendar';
import { getValidAccessToken } from '@/lib/google';
import {
  sendPresignedTransaction,
  confirmTransaction,
  isNonceValid,
  fetchNonce,
} from '@/lib/solana/nonce';
import { PublicKey } from '@solana/web3.js';
import { verifyCronSecret, addSecurityHeaders } from '@/lib/auth/middleware';

// Execution lock tracking (in-memory, use Redis in production)
const executingTransactions = new Set<string>();

// GET /api/cron/execute - Execute pending scheduled transactions
// This endpoint is called by Vercel Cron every minute
export async function GET(request: NextRequest) {
  // Verify cron secret with constant-time comparison
  // IMPORTANT: This will FAIL if CRON_SECRET is not configured (no bypass)
  if (!verifyCronSecret(request)) {
    console.error('[Cron] Unauthorized access attempt');
    return addSecurityHeaders(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
  }

  const supabase = createAdminClient();
  const now = new Date();

  console.log(`[Cron] Starting execution check at ${now.toISOString()}`);

  // Get transactions that are ready for execution
  // Priority: 'ready' (pre-signed) > 'pending' (legacy)
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
      ),
      nonce_accounts (
        id,
        pubkey,
        current_nonce
      )
    `
    )
    .in('status', ['ready', 'pending'])
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10); // Process in batches to avoid timeout

  if (error) {
    console.error('[Cron] Failed to fetch transactions:', error);
    return addSecurityHeaders(
      NextResponse.json({ error: error.message }, { status: 500 })
    );
  }

  if (!transactions || transactions.length === 0) {
    console.log('[Cron] No pending transactions to execute');
    return addSecurityHeaders(
      NextResponse.json({
        message: 'No pending transactions',
        processed: 0,
      })
    );
  }

  console.log(`[Cron] Found ${transactions.length} transactions to process`);

  const results: Array<{
    id: string;
    status: 'completed' | 'failed' | 'skipped';
    signature?: string;
    error?: string;
  }> = [];

  for (const tx of transactions) {
    // Skip if already executing (prevents duplicates)
    if (executingTransactions.has(tx.id)) {
      console.log(`[Cron] Transaction ${tx.id} is already executing, skipping`);
      results.push({ id: tx.id, status: 'skipped', error: 'Already executing' });
      continue;
    }

    // Acquire lock
    executingTransactions.add(tx.id);

    console.log(`[Cron] Processing transaction ${tx.id}`);

    try {
      // Double-check status hasn't changed (another worker might have processed it)
      const { data: currentTx } = await supabase
        .from('scheduled_transactions')
        .select('status')
        .eq('id', tx.id)
        .single();

      if (!currentTx || !['ready', 'pending'].includes(currentTx.status)) {
        console.log(`[Cron] Transaction ${tx.id} status changed, skipping`);
        results.push({ id: tx.id, status: 'skipped', error: 'Status changed' });
        continue;
      }

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
        // Verify nonce is still valid before sending
        if (tx.nonce_accounts?.pubkey) {
          const noncePubkey = new PublicKey(tx.nonce_accounts.pubkey);

          try {
            const currentNonce = await fetchNonce(noncePubkey);
            // If we stored the nonce, verify it matches
            if (tx.nonce_accounts.current_nonce &&
                currentNonce !== tx.nonce_accounts.current_nonce) {
              throw new Error('Nonce has been advanced, transaction is stale');
            }
          } catch (nonceError) {
            throw new Error(`Nonce validation failed: ${nonceError}`);
          }
        }

        // Execute pre-signed durable transaction
        console.log(`[Cron] Sending pre-signed transaction for ${tx.id}`);
        signature = await sendPresignedTransaction(tx.presigned_tx_base64);

        // Wait for confirmation with timeout
        const confirmed = await confirmTransaction(signature);

        if (!confirmed) {
          throw new Error('Transaction failed to confirm');
        }
      } else {
        // Transaction doesn't have pre-signed data
        throw new Error(
          'Transaction requires pre-signed data. Please sign the transaction first.'
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

      // Release nonce account for reuse
      if (tx.nonce_account_id) {
        await supabase
          .from('nonce_accounts')
          .update({ is_available: true })
          .eq('id', tx.nonce_account_id);
      }

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
          // Create next occurrence (pending, needs to be signed)
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
              status: 'pending', // Needs to be signed before execution
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

      // Calculate retry delay with exponential backoff
      const retryDelays = [60, 120, 300]; // 1min, 2min, 5min
      const currentRetryDelay = retryDelays[Math.min(tx.retry_count, retryDelays.length - 1)];

      // Check if we should retry
      const shouldRetry = tx.retry_count < tx.max_retries;

      if (shouldRetry) {
        // Update retry count, set next attempt time
        const nextAttempt = new Date(Date.now() + currentRetryDelay * 1000);

        await supabase
          .from('scheduled_transactions')
          .update({
            status: tx.presigned_tx_base64 ? 'ready' : 'pending',
            retry_count: tx.retry_count + 1,
            error_message: errorMessage,
            scheduled_at: nextAttempt.toISOString(), // Delay next attempt
          })
          .eq('id', tx.id);

        console.log(
          `[Cron] Transaction ${tx.id} will retry in ${currentRetryDelay}s (${tx.retry_count + 1}/${tx.max_retries})`
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

        // Release nonce account
        if (tx.nonce_account_id) {
          await supabase
            .from('nonce_accounts')
            .update({ is_available: true })
            .eq('id', tx.nonce_account_id);
        }

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
          next_retry_delay: shouldRetry ? currentRetryDelay : null,
        },
      });

      results.push({ id: tx.id, status: 'failed', error: errorMessage });
    } finally {
      // Release lock
      executingTransactions.delete(tx.id);
    }
  }

  console.log(`[Cron] Processed ${results.length} transactions`);

  return addSecurityHeaders(
    NextResponse.json({
      processed: results.length,
      results,
      timestamp: now.toISOString(),
    })
  );
}

// Calculate next execution time based on RRULE
function calculateNextExecution(
  lastExecution: Date,
  rrule: string
): Date | null {
  const next = new Date(lastExecution);

  // Parse INTERVAL if present
  const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
  const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;

  if (rrule.includes('FREQ=DAILY')) {
    next.setDate(next.getDate() + interval);
    return next;
  }

  if (rrule.includes('FREQ=WEEKLY')) {
    next.setDate(next.getDate() + 7 * interval);
    return next;
  }

  if (rrule.includes('FREQ=MONTHLY')) {
    next.setMonth(next.getMonth() + interval);
    return next;
  }

  if (rrule.includes('FREQ=YEARLY')) {
    next.setFullYear(next.getFullYear() + interval);
    return next;
  }

  return null;
}
