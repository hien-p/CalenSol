import { z } from 'zod';
import { isValidSolanaAddress } from './solana';

/**
 * Custom Zod type for Solana addresses
 */
export const solanaAddressSchema = z
  .string()
  .min(32, 'Address must be at least 32 characters')
  .max(44, 'Address must be at most 44 characters')
  .refine(isValidSolanaAddress, {
    message: 'Invalid Solana address format',
  });

/**
 * Optional Solana address (null or valid address)
 */
export const optionalSolanaAddressSchema = z
  .string()
  .nullable()
  .optional()
  .refine((val) => !val || isValidSolanaAddress(val), {
    message: 'Invalid Solana address format',
  });

/**
 * Transaction types
 */
export const transactionTypeSchema = z.enum(['transfer', 'swap', 'stake']);

/**
 * Transaction status
 */
export const transactionStatusSchema = z.enum([
  'pending',
  'ready',
  'executing',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * Create transaction request schema
 */
export const createTransactionSchema = z.object({
  walletAddress: solanaAddressSchema,
  type: transactionTypeSchema,
  scheduledAt: z.string().datetime({ message: 'Invalid datetime format' }),
  amount: z.number().positive('Amount must be positive'),
  tokenMint: optionalSolanaAddressSchema,
  recipient: solanaAddressSchema.optional(),
  inputMint: optionalSolanaAddressSchema,
  outputMint: optionalSolanaAddressSchema,
  slippageBps: z.number().int().min(0).max(10000).optional().default(100),
  recurrenceRule: z
    .string()
    .regex(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/, 'Invalid RRULE format')
    .optional(),
  memo: z.string().max(256, 'Memo too long').optional(),
});

/**
 * Update transaction request schema
 */
export const updateTransactionSchema = z.object({
  walletAddress: solanaAddressSchema,
  status: transactionStatusSchema.optional(),
  scheduledAt: z.string().datetime().optional(),
  amount: z.number().positive().optional(),
  recipient: solanaAddressSchema.optional(),
  memo: z.string().max(256).optional(),
});

/**
 * Get transactions query schema
 */
export const getTransactionsQuerySchema = z.object({
  wallet: solanaAddressSchema,
  status: transactionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/**
 * Nonce account creation schema
 */
export const createNonceAccountSchema = z.object({
  walletAddress: solanaAddressSchema,
});

/**
 * Transaction signing schema
 */
export const signTransactionSchema = z.object({
  walletAddress: solanaAddressSchema,
  signature: z.string().min(64, 'Invalid signature'),
  message: z.string().min(1, 'Message is required'),
});

/**
 * Calendar event schema
 */
export const calendarEventSchema = z.object({
  title: z.string().min(1).max(256),
  scheduledAt: z.string().datetime(),
  transactionType: transactionTypeSchema,
  amount: z.number().positive(),
  tokenSymbol: z.string().min(1).max(10),
  recipient: solanaAddressSchema.optional(),
  inputToken: z.string().optional(),
  outputToken: z.string().optional(),
});

/**
 * Error response schema
 */
export const errorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

/**
 * Success response with transaction
 */
export const transactionResponseSchema = z.object({
  transaction: z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    transaction_type: transactionTypeSchema,
    scheduled_at: z.string().datetime(),
    amount: z.number(),
    token_mint: z.string().nullable(),
    to_pubkey: z.string().nullable(),
    status: transactionStatusSchema,
    from_pubkey: z.string(),
    signature: z.string().nullable(),
    error_message: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
  calendarEventId: z.string().optional(),
});

// Export types
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type GetTransactionsQuery = z.infer<typeof getTransactionsQuerySchema>;
export type TransactionType = z.infer<typeof transactionTypeSchema>;
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;
