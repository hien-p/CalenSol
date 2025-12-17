# CalenSol: Complete Project Blueprint
## Calendar-Native Solana Wallet with LazorKit Integration

**Target:** LazorKit SDK Bounty - 1 week build time
**Stack:** Next.js 14 + LazorKit + Google Calendar API + Supabase + Vercel Cron

---

## Executive Summary

CalenSol transforms Google Calendar into a Solana transaction scheduler. Users create calendar events like "Send 100 USDC to alice.sol at 3PM Friday" and the system automatically executes the transaction at the scheduled time.

**Why This Wins the Bounty:**
1. ✅ Unique concept - No existing calendar-native crypto wallet
2. ✅ Real-world use case - Addresses actual DeFi pain points
3. ✅ LazorKit showcase - Passkey auth + gasless transactions
4. ✅ Multiple tutorials possible - Calendar setup, passkey wallet, scheduled transfers
5. ✅ Clear demo flow - Create event → Watch transaction execute

---

## Part 1: Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Calendar   │  │   Wallet     │  │  Transaction │              │
│  │    View      │  │   Connect    │  │    List      │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      NEXT.JS API ROUTES                             │
│  /api/auth/google     - Google OAuth callback                       │
│  /api/calendar/events - CRUD calendar events                        │
│  /api/transactions    - Create/manage scheduled transactions        │
│  /api/cron/execute    - Execute pending transactions (Vercel Cron)  │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   GOOGLE CALENDAR │ │    SUPABASE      │ │     SOLANA       │
│   - OAuth 2.0     │ │    - Users       │ │   - LazorKit     │
│   - Events API    │ │    - Wallets     │ │   - Durable Nonce│
│   - Extended Props│ │    - Transactions│ │   - Jupiter DCA  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Data Flow

```
1. User connects LazorKit wallet (passkey/biometric)
2. User connects Google Calendar (OAuth2)
3. User creates calendar event: "Send 50 USDC to bob.sol"
4. System parses event → Creates transaction intent
5. User pre-signs transaction with LazorKit (gasless)
6. Transaction stored in Supabase with nonce
7. Vercel Cron checks pending transactions every minute
8. At scheduled time → Execute pre-signed transaction
9. Update calendar event status (✓ Completed)
```

---

## Part 2: Tech Stack & Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "next": "^14.2.0",
    "@lazorkit/wallet": "^1.4.8",
    "@coral-xyz/anchor": "^0.29.0",
    "@solana/web3.js": "^1.91.0",
    "@solana/spl-token": "^0.4.0",
    "@jup-ag/dca-sdk": "^1.0.0",
    "@supabase/ssr": "^0.3.0",
    "@supabase/supabase-js": "^2.43.0",
    "googleapis": "^134.0.0",
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.378.0",
    "date-fns": "^3.6.0",
    "zod": "^3.23.0",
    "buffer": "^6.0.3"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0"
  }
}
```

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# LazorKit
NEXT_PUBLIC_LAZORKIT_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_LAZORKIT_PORTAL_URL=https://portal.lazor.sh
NEXT_PUBLIC_LAZORKIT_PAYMASTER_URL=https://lazorkit-paymaster.onrender.com

# Solana
NEXT_PUBLIC_SOLANA_NETWORK=devnet
HELIUS_API_KEY=your-helius-key

# Cron Security
CRON_SECRET=generate-32-char-random-string
```

---

## Part 3: Database Schema (Supabase)

### SQL Migration

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  smart_wallet_pubkey VARCHAR(44) UNIQUE,
  passkey_pubkey BYTEA,
  credential_id VARCHAR(255),
  google_refresh_token TEXT,
  google_calendar_id VARCHAR(255) DEFAULT 'primary',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nonce accounts for durable transactions
CREATE TABLE nonce_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pubkey VARCHAR(44) UNIQUE NOT NULL,
  authority_pubkey VARCHAR(44) NOT NULL,
  current_nonce VARCHAR(88),
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled transactions
CREATE TABLE scheduled_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  nonce_account_id UUID REFERENCES nonce_accounts(id),
  
  -- Google Calendar reference
  google_event_id VARCHAR(255),
  google_calendar_id VARCHAR(255) DEFAULT 'primary',
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  recurrence_rule VARCHAR(255), -- RFC 5545 RRULE format
  next_execution_at TIMESTAMPTZ,
  
  -- Transaction details
  transaction_type VARCHAR(20) NOT NULL, -- 'transfer', 'swap', 'stake'
  from_pubkey VARCHAR(44) NOT NULL,
  to_pubkey VARCHAR(44),
  amount BIGINT NOT NULL,
  token_mint VARCHAR(44), -- null for SOL
  
  -- For swaps
  input_mint VARCHAR(44),
  output_mint VARCHAR(44),
  slippage_bps INTEGER DEFAULT 100, -- 1%
  
  -- Pre-signed transaction (encrypted)
  presigned_tx_base64 TEXT,
  
  -- State
  status VARCHAR(20) DEFAULT 'pending',
  -- pending → ready → executing → completed/failed/cancelled
  
  -- Results
  signature VARCHAR(88),
  error_message TEXT,
  executed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaction execution logs
CREATE TABLE execution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES scheduled_transactions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_scheduled_transactions_status ON scheduled_transactions(status);
CREATE INDEX idx_scheduled_transactions_scheduled_at ON scheduled_transactions(scheduled_at);
CREATE INDEX idx_scheduled_transactions_user_id ON scheduled_transactions(user_id);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nonce_accounts ENABLE ROW LEVEL SECURITY;

-- Policies (users can only access their own data)
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);
  
CREATE POLICY "Users can view own transactions" ON scheduled_transactions
  FOR ALL USING (user_id = auth.uid());
```

---

## Part 4: LazorKit Integration

### Provider Setup

```tsx
// providers/LazorKitProvider.tsx
'use client';

import { LazorkitProvider } from '@lazorkit/wallet';
import { ReactNode } from 'react';

// Polyfills for browser environment
if (typeof window !== 'undefined') {
  const { Buffer } = require('buffer');
  window.Buffer = Buffer;
}

interface Props {
  children: ReactNode;
}

export function LazorKitProvider({ children }: Props) {
  return (
    <LazorkitProvider
      rpcUrl={process.env.NEXT_PUBLIC_LAZORKIT_RPC_URL!}
      ipfsUrl={process.env.NEXT_PUBLIC_LAZORKIT_PORTAL_URL!}
      paymasterUrl={process.env.NEXT_PUBLIC_LAZORKIT_PAYMASTER_URL!}
    >
      {children}
    </LazorkitProvider>
  );
}
```

### Wallet Hook

```tsx
// hooks/useCalenSolWallet.ts
'use client';

import { useWallet } from '@lazorkit/wallet';
import { 
  PublicKey, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  TransactionInstruction 
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token';

export function useCalenSolWallet() {
  const {
    smartWalletPubkey,
    isConnected,
    isLoading,
    isConnecting,
    isSigning,
    error,
    account,
    connect,
    disconnect,
    signTransaction,
    signAndSendTransaction,
  } = useWallet();

  // Connect wallet with passkey (Face ID / Touch ID)
  const connectWallet = async () => {
    try {
      const walletAccount = await connect();
      console.log('Connected wallet:', walletAccount.smartWallet);
      return walletAccount;
    } catch (err) {
      console.error('Failed to connect:', err);
      throw err;
    }
  };

  // Create SOL transfer instruction
  const createSolTransferInstruction = (
    toPubkey: string,
    lamports: number
  ): TransactionInstruction => {
    if (!smartWalletPubkey) throw new Error('Wallet not connected');
    
    return SystemProgram.transfer({
      fromPubkey: smartWalletPubkey,
      toPubkey: new PublicKey(toPubkey),
      lamports,
    });
  };

  // Create SPL token transfer instruction
  const createTokenTransferInstruction = async (
    tokenMint: string,
    toPubkey: string,
    amount: number,
    decimals: number
  ): Promise<TransactionInstruction> => {
    if (!smartWalletPubkey) throw new Error('Wallet not connected');
    
    const mintPubkey = new PublicKey(tokenMint);
    const recipientPubkey = new PublicKey(toPubkey);
    
    const fromAta = await getAssociatedTokenAddress(
      mintPubkey,
      smartWalletPubkey
    );
    
    const toAta = await getAssociatedTokenAddress(
      mintPubkey,
      recipientPubkey
    );
    
    return createTransferInstruction(
      fromAta,
      toAta,
      smartWalletPubkey,
      amount * Math.pow(10, decimals),
      [],
      TOKEN_PROGRAM_ID
    );
  };

  // Sign and send a transfer (gasless via paymaster)
  const executeTransfer = async (
    toPubkey: string,
    amount: number,
    tokenMint?: string // undefined = SOL
  ): Promise<string> => {
    if (!smartWalletPubkey) throw new Error('Wallet not connected');

    let instruction: TransactionInstruction;

    if (tokenMint) {
      // USDC has 6 decimals
      const decimals = tokenMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 6 : 9;
      instruction = await createTokenTransferInstruction(
        tokenMint,
        toPubkey,
        amount,
        decimals
      );
    } else {
      instruction = createSolTransferInstruction(
        toPubkey,
        amount * LAMPORTS_PER_SOL
      );
    }

    // Sign and send via LazorKit (gasless!)
    const signature = await signAndSendTransaction(instruction);
    return signature;
  };

  return {
    // State
    walletAddress: smartWalletPubkey?.toBase58(),
    isConnected,
    isLoading: isLoading || isConnecting || isSigning,
    error,
    
    // Actions
    connect: connectWallet,
    disconnect,
    executeTransfer,
    signTransaction,
    signAndSendTransaction,
    
    // Helpers
    createSolTransferInstruction,
    createTokenTransferInstruction,
  };
}
```

### Wallet Connect Button Component

```tsx
// components/WalletButton.tsx
'use client';

import { useCalenSolWallet } from '@/hooks/useCalenSolWallet';
import { Fingerprint, Wallet, LogOut, Loader2 } from 'lucide-react';

export function WalletButton() {
  const { 
    walletAddress, 
    isConnected, 
    isLoading, 
    connect, 
    disconnect,
    error 
  } = useCalenSolWallet();

  const truncateAddress = (addr: string) => 
    `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  if (isLoading) {
    return (
      <button 
        disabled 
        className="flex items-center gap-2 px-4 py-2 bg-gray-200 rounded-lg"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Connecting...
      </button>
    );
  }

  if (isConnected && walletAddress) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg">
          <Wallet className="w-4 h-4" />
          {truncateAddress(walletAddress)}
        </div>
        <button
          onClick={disconnect}
          className="p-2 text-gray-500 hover:text-red-500 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity"
    >
      <Fingerprint className="w-5 h-5" />
      Connect with Passkey
    </button>
  );
}
```

---

## Part 5: Google Calendar Integration

### OAuth Setup

```ts
// lib/google.ts
import { google } from 'googleapis';

export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

export const getAuthUrl = () => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force refresh token
  });
};

export const getCalendarClient = (accessToken: string, refreshToken?: string) => {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  
  return google.calendar({ version: 'v3', auth });
};
```

### API Route - OAuth Callback

```ts
// app/api/auth/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { oauth2Client } from '@/lib/google';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // Contains user's wallet address
  
  if (!code) {
    return NextResponse.redirect('/error?message=No authorization code');
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const supabase = createClient();
    
    // Store refresh token for the user
    const { error } = await supabase
      .from('users')
      .update({
        google_refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString(),
      })
      .eq('smart_wallet_pubkey', state);
    
    if (error) throw error;
    
    return NextResponse.redirect('/dashboard?google=connected');
  } catch (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect('/error?message=OAuth failed');
  }
}
```

### Calendar Event Creation with Extended Properties

```ts
// lib/calendar.ts
import { getCalendarClient } from '@/lib/google';
import { calendar_v3 } from 'googleapis';

interface CalenSolEvent {
  title: string;
  scheduledAt: Date;
  transactionType: 'transfer' | 'swap';
  amount: number;
  tokenSymbol: string;
  recipient?: string;
  inputToken?: string;
  outputToken?: string;
}

// Color coding for transaction types
const EVENT_COLORS = {
  transfer: '9',    // Blue - Transfers/Payments
  swap: '10',       // Green - Token Swaps
  stake: '3',       // Purple - Staking
  recurring: '5',   // Yellow - Recurring
};

export async function createCalendarEvent(
  accessToken: string,
  refreshToken: string,
  event: CalenSolEvent,
  transactionId: string
): Promise<calendar_v3.Schema$Event> {
  const calendar = getCalendarClient(accessToken, refreshToken);
  
  // Build description based on transaction type
  let description = `CalenSol Transaction\n\n`;
  
  if (event.transactionType === 'transfer') {
    description += `📤 Send ${event.amount} ${event.tokenSymbol}\n`;
    description += `👤 To: ${event.recipient}\n`;
  } else if (event.transactionType === 'swap') {
    description += `🔄 Swap ${event.amount} ${event.inputToken} → ${event.outputToken}\n`;
  }
  
  description += `\n⏰ Status: Pending\n`;
  description += `🔗 Transaction ID: ${transactionId}`;
  
  const calendarEvent = {
    summary: event.title,
    description,
    start: {
      dateTime: event.scheduledAt.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: new Date(event.scheduledAt.getTime() + 30 * 60000).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    colorId: EVENT_COLORS[event.transactionType],
    // Store transaction data in extended properties
    extendedProperties: {
      private: {
        calensol_tx_id: transactionId,
        calensol_type: event.transactionType,
        calensol_amount: event.amount.toString(),
        calensol_token: event.tokenSymbol,
        calensol_recipient: event.recipient || '',
        calensol_status: 'pending',
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'popup', minutes: 1 },
      ],
    },
  };
  
  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: calendarEvent,
  });
  
  return response.data;
}

// Update event status after execution
export async function updateEventStatus(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  status: 'completed' | 'failed',
  signature?: string
): Promise<void> {
  const calendar = getCalendarClient(accessToken, refreshToken);
  
  const event = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });
  
  let description = event.data.description || '';
  
  if (status === 'completed') {
    description = description.replace('⏰ Status: Pending', '✅ Status: Completed');
    if (signature) {
      description += `\n\n🔗 Signature: ${signature}`;
      description += `\n📎 Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    }
  } else {
    description = description.replace('⏰ Status: Pending', '❌ Status: Failed');
  }
  
  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: {
      description,
      colorId: status === 'completed' ? '10' : '11', // Green or Red
      extendedProperties: {
        private: {
          ...event.data.extendedProperties?.private,
          calensol_status: status,
          calensol_signature: signature || '',
        },
      },
    },
  });
}

// List CalenSol events
export async function listCalenSolEvents(
  accessToken: string,
  refreshToken: string,
  timeMin: Date = new Date(),
  maxResults: number = 50
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = getCalendarClient(accessToken, refreshToken);
  
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
    privateExtendedProperty: 'calensol_tx_id', // Only CalenSol events
  });
  
  return response.data.items || [];
}
```

---

## Part 6: Durable Nonce Implementation

### Creating Nonce Account

```ts
// lib/solana/nonce.ts
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  NONCE_ACCOUNT_LENGTH,
  NonceAccount,
} from '@solana/web3.js';

const connection = new Connection(
  process.env.NEXT_PUBLIC_LAZORKIT_RPC_URL!,
  'confirmed'
);

// Create a nonce account for scheduling transactions
export async function createNonceAccount(
  feePayer: PublicKey,
  nonceAuthority: PublicKey
): Promise<{
  nonceKeypair: Keypair;
  createNonceIx: Transaction;
}> {
  const nonceKeypair = Keypair.generate();
  
  const rentExempt = await connection.getMinimumBalanceForRentExemption(
    NONCE_ACCOUNT_LENGTH
  );
  
  const transaction = new Transaction().add(
    // Create nonce account
    SystemProgram.createAccount({
      fromPubkey: feePayer,
      newAccountPubkey: nonceKeypair.publicKey,
      lamports: rentExempt,
      space: NONCE_ACCOUNT_LENGTH,
      programId: SystemProgram.programId,
    }),
    // Initialize nonce account
    SystemProgram.nonceInitialize({
      noncePubkey: nonceKeypair.publicKey,
      authorizedPubkey: nonceAuthority,
    })
  );
  
  return { nonceKeypair, createNonceIx: transaction };
}

// Fetch current nonce value
export async function fetchNonce(
  nonceAccountPubkey: PublicKey
): Promise<string> {
  const accountInfo = await connection.getAccountInfo(nonceAccountPubkey);
  
  if (!accountInfo) {
    throw new Error('Nonce account not found');
  }
  
  const nonceAccount = NonceAccount.fromAccountData(accountInfo.data);
  return nonceAccount.nonce;
}

// Build a durable transaction using nonce
export function buildDurableTransaction(
  nonce: string,
  nonceAccountPubkey: PublicKey,
  nonceAuthority: PublicKey,
  instructions: TransactionInstruction[],
  feePayer: PublicKey
): Transaction {
  const transaction = new Transaction();
  
  // First instruction MUST be nonce advance
  transaction.add(
    SystemProgram.nonceAdvance({
      noncePubkey: nonceAccountPubkey,
      authorizedPubkey: nonceAuthority,
    })
  );
  
  // Add actual transaction instructions
  instructions.forEach(ix => transaction.add(ix));
  
  // Use nonce as recent blockhash
  transaction.recentBlockhash = nonce;
  transaction.feePayer = feePayer;
  
  return transaction;
}
```

---

## Part 7: Scheduled Transaction API

### Create Scheduled Transaction

```ts
// app/api/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCalendarEvent } from '@/lib/calendar';
import { z } from 'zod';

const CreateTransactionSchema = z.object({
  type: z.enum(['transfer', 'swap']),
  scheduledAt: z.string().datetime(),
  amount: z.number().positive(),
  tokenMint: z.string().optional(), // undefined = SOL
  recipient: z.string().optional(), // For transfers
  inputMint: z.string().optional(), // For swaps
  outputMint: z.string().optional(), // For swaps
  recurrenceRule: z.string().optional(), // RFC 5545 RRULE
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    // Validate input
    const data = CreateTransactionSchema.parse(body);
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user's wallet info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('smart_wallet_pubkey, google_refresh_token')
      .eq('id', user.id)
      .single();
    
    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Create transaction record
    const { data: transaction, error: txError } = await supabase
      .from('scheduled_transactions')
      .insert({
        user_id: user.id,
        transaction_type: data.type,
        scheduled_at: data.scheduledAt,
        next_execution_at: data.scheduledAt,
        from_pubkey: userData.smart_wallet_pubkey,
        to_pubkey: data.recipient,
        amount: data.amount,
        token_mint: data.tokenMint,
        input_mint: data.inputMint,
        output_mint: data.outputMint,
        recurrence_rule: data.recurrenceRule,
        status: 'pending',
      })
      .select()
      .single();
    
    if (txError) {
      throw txError;
    }
    
    // Create Google Calendar event
    if (userData.google_refresh_token) {
      const tokenSymbol = data.tokenMint 
        ? (data.tokenMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 'USDC' : 'SPL')
        : 'SOL';
      
      const eventTitle = data.type === 'transfer'
        ? `Send ${data.amount} ${tokenSymbol} to ${data.recipient?.slice(0, 8)}...`
        : `Swap ${data.amount} ${tokenSymbol}`;
      
      try {
        // Get fresh access token
        const { tokens } = await oauth2Client.refreshAccessToken();
        
        const calendarEvent = await createCalendarEvent(
          tokens.access_token!,
          userData.google_refresh_token,
          {
            title: eventTitle,
            scheduledAt: new Date(data.scheduledAt),
            transactionType: data.type,
            amount: data.amount,
            tokenSymbol,
            recipient: data.recipient,
            inputToken: data.inputMint,
            outputToken: data.outputMint,
          },
          transaction.id
        );
        
        // Update transaction with calendar event ID
        await supabase
          .from('scheduled_transactions')
          .update({ google_event_id: calendarEvent.id })
          .eq('id', transaction.id);
        
      } catch (calError) {
        console.error('Failed to create calendar event:', calError);
        // Don't fail the whole request, calendar is optional
      }
    }
    
    return NextResponse.json({ transaction });
    
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

// List user's scheduled transactions
export async function GET(request: NextRequest) {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { data: transactions, error } = await supabase
    .from('scheduled_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('scheduled_at', { ascending: true });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ transactions });
}
```

---

## Part 8: Cron Job Execution

### Vercel Cron Configuration

```json
// vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/execute",
      "schedule": "* * * * *"
    }
  ]
}
```

### Execution API Route

```ts
// app/api/cron/execute/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from '@solana/web3.js';

// Use service role for cron jobs
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const connection = new Connection(
  process.env.NEXT_PUBLIC_LAZORKIT_RPC_URL!,
  'confirmed'
);

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const now = new Date();
  
  // Get pending transactions that are due
  const { data: transactions, error } = await supabase
    .from('scheduled_transactions')
    .select(`
      *,
      users (
        smart_wallet_pubkey,
        google_refresh_token
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .limit(10); // Process in batches
  
  if (error) {
    console.error('Failed to fetch transactions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ message: 'No pending transactions' });
  }
  
  const results = [];
  
  for (const tx of transactions) {
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
      });
      
      let signature: string;
      
      if (tx.presigned_tx_base64) {
        // Execute pre-signed durable transaction
        const txBuffer = Buffer.from(tx.presigned_tx_base64, 'base64');
        signature = await connection.sendRawTransaction(txBuffer, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } else {
        // For swaps, we need to build fresh transaction
        // This would integrate with Jupiter DCA
        throw new Error('Fresh transaction building not implemented');
      }
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Update transaction status
      await supabase
        .from('scheduled_transactions')
        .update({
          status: 'completed',
          signature,
          executed_at: new Date().toISOString(),
        })
        .eq('id', tx.id);
      
      // Update Google Calendar event
      if (tx.google_event_id && tx.users?.google_refresh_token) {
        try {
          await updateEventStatus(
            tx.users.google_refresh_token,
            tx.users.google_refresh_token,
            tx.google_event_id,
            'completed',
            signature
          );
        } catch (calError) {
          console.error('Failed to update calendar:', calError);
        }
      }
      
      // Log success
      await supabase.from('execution_logs').insert({
        transaction_id: tx.id,
        status: 'completed',
        message: `Transaction executed: ${signature}`,
      });
      
      results.push({ id: tx.id, status: 'completed', signature });
      
      // Handle recurring transactions
      if (tx.recurrence_rule) {
        // Calculate next execution time based on RRULE
        // Implementation depends on your recurrence library
        const nextExecution = calculateNextExecution(
          new Date(tx.scheduled_at),
          tx.recurrence_rule
        );
        
        if (nextExecution) {
          await supabase.from('scheduled_transactions').insert({
            ...tx,
            id: undefined, // New ID
            scheduled_at: nextExecution.toISOString(),
            next_execution_at: nextExecution.toISOString(),
            status: 'pending',
            signature: null,
            executed_at: null,
          });
        }
      }
      
    } catch (error) {
      console.error(`Failed to execute tx ${tx.id}:`, error);
      
      // Update status to failed
      await supabase
        .from('scheduled_transactions')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', tx.id);
      
      // Update calendar event
      if (tx.google_event_id && tx.users?.google_refresh_token) {
        try {
          await updateEventStatus(
            tx.users.google_refresh_token,
            tx.users.google_refresh_token,
            tx.google_event_id,
            'failed'
          );
        } catch (calError) {
          console.error('Failed to update calendar:', calError);
        }
      }
      
      // Log failure
      await supabase.from('execution_logs').insert({
        transaction_id: tx.id,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      
      results.push({
        id: tx.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return NextResponse.json({
    processed: results.length,
    results,
  });
}

// Helper to calculate next execution for recurring transactions
function calculateNextExecution(
  lastExecution: Date,
  rrule: string
): Date | null {
  // Simple implementation for common patterns
  // For production, use a library like rrule-js
  
  if (rrule.includes('FREQ=DAILY')) {
    return new Date(lastExecution.getTime() + 24 * 60 * 60 * 1000);
  }
  if (rrule.includes('FREQ=WEEKLY')) {
    return new Date(lastExecution.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  if (rrule.includes('FREQ=MONTHLY')) {
    const next = new Date(lastExecution);
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  
  return null;
}
```

---

## Part 9: Frontend Components

### Calendar View

```tsx
// components/CalendarView.tsx
'use client';

import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Send, RefreshCw } from 'lucide-react';

interface ScheduledTransaction {
  id: string;
  scheduled_at: string;
  transaction_type: 'transfer' | 'swap';
  amount: number;
  token_mint: string | null;
  to_pubkey: string | null;
  status: string;
}

interface CalendarViewProps {
  transactions: ScheduledTransaction[];
  onDateClick: (date: Date) => void;
}

export function CalendarView({ transactions, onDateClick }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const getTransactionsForDay = (day: Date) => {
    return transactions.filter(tx => 
      isSameDay(new Date(tx.scheduled_at), day)
    );
  };
  
  const getTokenSymbol = (mint: string | null) => {
    if (!mint) return 'SOL';
    if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') return 'USDC';
    return 'SPL';
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'executing': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentMonth(prev => new Date(prev.setMonth(prev.getMonth() - 1)))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentMonth(prev => new Date(prev.setMonth(prev.getMonth() + 1)))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for days before month start */}
        {Array.from({ length: monthStart.getDay() }).map((_, i) => (
          <div key={`empty-${i}`} className="h-24" />
        ))}
        
        {/* Day cells */}
        {days.map(day => {
          const dayTransactions = getTransactionsForDay(day);
          
          return (
            <div
              key={day.toISOString()}
              onClick={() => onDateClick(day)}
              className={`
                h-24 p-2 border rounded-lg cursor-pointer transition-colors
                ${isToday(day) ? 'bg-blue-50 border-blue-300' : 'border-gray-200 hover:bg-gray-50'}
              `}
            >
              <div className={`text-sm font-medium ${isToday(day) ? 'text-blue-600' : 'text-gray-700'}`}>
                {format(day, 'd')}
              </div>
              
              {/* Transaction indicators */}
              <div className="mt-1 space-y-1">
                {dayTransactions.slice(0, 2).map(tx => (
                  <div
                    key={tx.id}
                    className={`
                      text-xs px-1.5 py-0.5 rounded flex items-center gap-1
                      ${tx.transaction_type === 'transfer' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}
                    `}
                  >
                    {tx.transaction_type === 'transfer' ? (
                      <Send className="w-3 h-3" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span className="truncate">
                      {tx.amount} {getTokenSymbol(tx.token_mint)}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(tx.status)}`} />
                  </div>
                ))}
                {dayTransactions.length > 2 && (
                  <div className="text-xs text-gray-500">
                    +{dayTransactions.length - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### Create Transaction Modal

```tsx
// components/CreateTransactionModal.tsx
'use client';

import { useState } from 'react';
import { X, Calendar, Send, RefreshCw, Clock } from 'lucide-react';
import { useCalenSolWallet } from '@/hooks/useCalenSolWallet';

interface CreateTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date;
  onSuccess: () => void;
}

export function CreateTransactionModal({ 
  isOpen, 
  onClose, 
  selectedDate,
  onSuccess 
}: CreateTransactionModalProps) {
  const { walletAddress } = useCalenSolWallet();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    type: 'transfer' as 'transfer' | 'swap',
    recipient: '',
    amount: '',
    token: 'SOL',
    date: selectedDate?.toISOString().split('T')[0] || '',
    time: '12:00',
    recurring: false,
    recurrenceRule: '',
  });
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const scheduledAt = new Date(`${formData.date}T${formData.time}:00`);
      
      const tokenMint = formData.token === 'USDC' 
        ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        : undefined;
      
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formData.type,
          scheduledAt: scheduledAt.toISOString(),
          amount: parseFloat(formData.amount),
          tokenMint,
          recipient: formData.recipient,
          recurrenceRule: formData.recurring ? formData.recurrenceRule : undefined,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create transaction');
      }
      
      onSuccess();
      onClose();
      
    } catch (error) {
      console.error('Failed to create transaction:', error);
      alert('Failed to create transaction');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Schedule Transaction</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Transaction Type */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'transfer' }))}
              className={`
                flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all
                ${formData.type === 'transfer' 
                  ? 'border-blue-500 bg-blue-50 text-blue-700' 
                  : 'border-gray-200 hover:border-gray-300'}
              `}
            >
              <Send className="w-5 h-5" />
              Transfer
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'swap' }))}
              className={`
                flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all
                ${formData.type === 'swap' 
                  ? 'border-green-500 bg-green-50 text-green-700' 
                  : 'border-gray-200 hover:border-gray-300'}
              `}
            >
              <RefreshCw className="w-5 h-5" />
              Swap
            </button>
          </div>
          
          {/* Amount & Token */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
                required
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Token
              </label>
              <select
                value={formData.token}
                onChange={e => setFormData(prev => ({ ...prev, token: e.target.value }))}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500"
              >
                <option value="SOL">SOL</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
          </div>
          
          {/* Recipient (for transfers) */}
          {formData.type === 'transfer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient Address
              </label>
              <input
                type="text"
                value={formData.recipient}
                onChange={e => setFormData(prev => ({ ...prev, recipient: e.target.value }))}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="Solana address or .sol domain"
                required
              />
            </div>
          )}
          
          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-4 h-4 inline mr-1" />
                Time
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={e => setFormData(prev => ({ ...prev, time: e.target.value }))}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
          
          {/* Recurring Toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.recurring}
              onChange={e => setFormData(prev => ({ ...prev, recurring: e.target.checked }))}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Recurring transaction
            </span>
          </label>
          
          {/* Recurrence Rule */}
          {formData.recurring && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Repeat
              </label>
              <select
                value={formData.recurrenceRule}
                onChange={e => setFormData(prev => ({ ...prev, recurrenceRule: e.target.value }))}
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500"
              >
                <option value="FREQ=DAILY">Daily</option>
                <option value="FREQ=WEEKLY">Weekly</option>
                <option value="FREQ=MONTHLY">Monthly</option>
              </select>
            </div>
          )}
          
          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Schedule Transaction'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## Part 10: Project Structure

```
calensol/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Landing page
│   ├── dashboard/
│   │   └── page.tsx                # Main calendar dashboard
│   ├── api/
│   │   ├── auth/
│   │   │   └── google/
│   │   │       ├── route.ts        # Initiate OAuth
│   │   │       └── callback/
│   │   │           └── route.ts    # OAuth callback
│   │   ├── transactions/
│   │   │   ├── route.ts            # CRUD transactions
│   │   │   └── [id]/
│   │   │       └── route.ts        # Single transaction
│   │   ├── calendar/
│   │   │   └── events/
│   │   │       └── route.ts        # Calendar sync
│   │   └── cron/
│   │       └── execute/
│   │           └── route.ts        # Cron execution
│   └── globals.css
├── components/
│   ├── WalletButton.tsx
│   ├── CalendarView.tsx
│   ├── CreateTransactionModal.tsx
│   ├── TransactionList.tsx
│   └── Header.tsx
├── hooks/
│   ├── useCalenSolWallet.ts
│   └── useTransactions.ts
├── lib/
│   ├── google.ts                   # Google Calendar client
│   ├── calendar.ts                 # Calendar helpers
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── solana/
│       ├── nonce.ts                # Durable nonce helpers
│       └── jupiter.ts              # Jupiter DCA integration
├── providers/
│   └── LazorKitProvider.tsx
├── types/
│   └── index.ts
├── public/
├── vercel.json                     # Cron configuration
├── .env.local
├── package.json
└── README.md
```

---

## Part 11: Tutorial Outlines (For Bounty)

### Tutorial 1: Passkey Wallet Setup with LazorKit

```markdown
# How to Create a Passkey-Based Wallet with LazorKit

## Introduction
Learn how to integrate biometric authentication (Face ID/Touch ID) 
for Solana wallet creation - no seed phrases needed!

## Prerequisites
- Node.js 18+
- Next.js 14 project

## Steps
1. Install dependencies
2. Configure LazorKit provider
3. Implement connect/disconnect
4. Display wallet address
5. Handle errors

## Code Examples
[Full code with explanations]
```

### Tutorial 2: Gasless Transaction with LazorKit

```markdown
# Execute Gasless Transactions on Solana

## Introduction
Send SOL and SPL tokens without holding SOL for gas fees 
using LazorKit's paymaster service.

## Steps
1. Connect wallet
2. Build transfer instruction
3. Sign with passkey
4. Submit via paymaster
5. Confirm transaction

## Code Examples
[Full code with explanations]
```

### Tutorial 3: Google Calendar Integration

```markdown
# Integrate Google Calendar with Your Solana dApp

## Introduction
Learn how to use Google Calendar API to schedule and 
track blockchain transactions.

## Steps
1. Set up Google Cloud project
2. Configure OAuth 2.0
3. Create calendar events programmatically
4. Store transaction metadata in extended properties
5. Update events based on transaction status

## Code Examples
[Full code with explanations]
```

---

## Part 12: 1-Week Implementation Timeline

### Day 1-2: Foundation
- [ ] Initialize Next.js 14 project
- [ ] Set up Supabase project + schema
- [ ] Configure LazorKit provider
- [ ] Implement wallet connect/disconnect
- [ ] Basic UI layout

### Day 3-4: Core Features
- [ ] Google OAuth integration
- [ ] Calendar event CRUD
- [ ] Transaction intent API
- [ ] Pre-sign transaction flow

### Day 5-6: Execution Engine
- [ ] Vercel cron setup
- [ ] Transaction execution logic
- [ ] Calendar status updates
- [ ] Error handling + retry logic

### Day 7: Polish & Deploy
- [ ] UI improvements
- [ ] Testing on devnet
- [ ] Write tutorials
- [ ] Deploy to Vercel
- [ ] Create demo video

---

## Part 13: Demo Script

```
1. [Landing Page]
   "CalenSol - Your Google Calendar is now your Solana Smart Wallet"

2. [Connect Wallet]
   - Click "Connect with Passkey"
   - Use Face ID / Touch ID
   - Show wallet address

3. [Connect Calendar]
   - Click "Connect Google Calendar"
   - OAuth flow
   - Show calendar view

4. [Create Scheduled Transfer]
   - Click on future date
   - Fill form: "Send 1 USDC to alice.sol at 3PM"
   - Sign with passkey (gasless!)
   - See event appear in calendar (blue)

5. [Wait for Execution]
   - Fast-forward to scheduled time
   - Cron job executes
   - Event turns green ✓
   - Show transaction on Solana Explorer

6. [Show Recurring Payment]
   - Create weekly payment
   - Show multiple events created
```

---

## Quick Start Commands

```bash
# Clone and install
git clone https://github.com/your-username/calensol
cd calensol
npm install

# Set up environment
cp .env.example .env.local
# Fill in your keys

# Run database migrations
npx supabase db push

# Start development
npm run dev

# Deploy
vercel --prod
```

---

## Resources

- LazorKit Docs: https://lazorkit.com
- LazorKit GitHub: https://github.com/lazor-kit/lazor-kit
- LazorKit NPM: https://www.npmjs.com/package/@lazorkit/wallet
- Solana Durable Nonces: https://solana.com/developers/guides/advanced/introduction-to-durable-nonces
- Google Calendar API: https://developers.google.com/calendar
- Jupiter DCA SDK: https://station.jup.ag/docs/dca
- Vercel Cron: https://vercel.com/docs/cron-jobs
- Supabase + Next.js: https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs
