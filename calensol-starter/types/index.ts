// ===========================================
// CalenSol Type Definitions
// ===========================================

// Transaction Types
export type TransactionType = 'transfer' | 'swap' | 'stake';
export type TransactionStatus = 'pending' | 'ready' | 'executing' | 'completed' | 'failed' | 'cancelled';

// User
export interface User {
  id: string;
  email: string | null;
  smart_wallet_pubkey: string | null;
  passkey_pubkey: Uint8Array | null;
  credential_id: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  google_calendar_id: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

// Nonce Account
export interface NonceAccount {
  id: string;
  user_id: string;
  pubkey: string;
  authority_pubkey: string;
  current_nonce: string | null;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

// Scheduled Transaction
export interface ScheduledTransaction {
  id: string;
  user_id: string;
  nonce_account_id: string | null;
  google_event_id: string | null;
  google_calendar_id: string;
  scheduled_at: string;
  recurrence_rule: string | null;
  next_execution_at: string | null;
  max_executions: number | null;
  execution_count: number;
  transaction_type: TransactionType;
  from_pubkey: string;
  to_pubkey: string | null;
  amount: number;
  token_mint: string | null;
  input_mint: string | null;
  output_mint: string | null;
  slippage_bps: number;
  min_output_amount: number | null;
  presigned_tx_base64: string | null;
  status: TransactionStatus;
  signature: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  executed_at: string | null;
  memo: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

// Execution Log
export interface ExecutionLog {
  id: string;
  transaction_id: string;
  status: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Notification Preferences
export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_on_execution: boolean;
  email_on_failure: boolean;
  push_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// API Request/Response Types
export interface CreateTransactionRequest {
  type: TransactionType;
  scheduledAt: string;
  amount: number;
  tokenMint?: string;
  recipient?: string;
  inputMint?: string;
  outputMint?: string;
  slippageBps?: number;
  recurrenceRule?: string;
  memo?: string;
}

export interface CreateTransactionResponse {
  transaction: ScheduledTransaction;
  calendarEventId?: string;
}

export interface ListTransactionsResponse {
  transactions: ScheduledTransaction[];
}

export interface UpdateTransactionRequest {
  scheduledAt?: string;
  amount?: number;
  recipient?: string;
  status?: TransactionStatus;
  memo?: string;
}

// Calendar Event Types
export interface CalenSolEvent {
  title: string;
  scheduledAt: Date;
  transactionType: TransactionType;
  amount: number;
  tokenSymbol: string;
  recipient?: string;
  inputToken?: string;
  outputToken?: string;
}

export interface CalendarEventExtendedProperties {
  calensol_tx_id: string;
  calensol_type: TransactionType;
  calensol_amount: string;
  calensol_token: string;
  calensol_recipient?: string;
  calensol_status: TransactionStatus;
  calensol_signature?: string;
}

// Token Constants
export const TOKENS = {
  SOL: {
    symbol: 'SOL',
    mint: null,
    decimals: 9,
    name: 'Solana',
  },
  USDC: {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    name: 'USD Coin',
  },
  USDC_DEV: {
    symbol: 'USDC',
    mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    decimals: 6,
    name: 'USD Coin (Devnet)',
  },
} as const;

// Color coding for transaction types
export const TX_COLORS = {
  transfer: '9',    // Blue
  swap: '10',       // Green
  stake: '3',       // Purple
  recurring: '5',   // Yellow
} as const;

// Status colors
export const STATUS_COLORS = {
  pending: 'yellow',
  ready: 'blue',
  executing: 'blue',
  completed: 'green',
  failed: 'red',
  cancelled: 'gray',
} as const;

// Recurrence patterns
export const RECURRENCE_OPTIONS = [
  { label: 'Daily', value: 'FREQ=DAILY' },
  { label: 'Weekly', value: 'FREQ=WEEKLY' },
  { label: 'Bi-weekly', value: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Monthly', value: 'FREQ=MONTHLY' },
] as const;

// Database types for Supabase
export type Database = {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at'>>;
      };
      nonce_accounts: {
        Row: NonceAccount;
        Insert: Omit<NonceAccount, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<NonceAccount, 'id' | 'created_at'>>;
      };
      scheduled_transactions: {
        Row: ScheduledTransaction;
        Insert: Omit<ScheduledTransaction, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ScheduledTransaction, 'id' | 'created_at'>>;
      };
      execution_logs: {
        Row: ExecutionLog;
        Insert: Omit<ExecutionLog, 'id' | 'created_at'>;
        Update: Partial<Omit<ExecutionLog, 'id' | 'created_at'>>;
      };
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: Omit<NotificationPreferences, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<NotificationPreferences, 'id' | 'created_at'>>;
      };
    };
  };
};
