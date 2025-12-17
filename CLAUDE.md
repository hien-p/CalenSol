# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CalenSol is a calendar-native Solana wallet that schedules blockchain transactions like calendar events. It integrates Google Calendar with Solana blockchain operations using LazorKit SDK for passkey authentication and gasless transactions.

## Development Commands

```bash
cd calensol-starter

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint
```

## Architecture

### Core Flow
```
User creates calendar event
    → Event saved to Google Calendar (with transaction metadata in extended properties)
    → Transaction intent saved to Supabase
    → Vercel Cron checks every minute (/api/cron/execute)
    → At scheduled time → Execute transaction
    → Update calendar event status
```

### Key Technical Constraints
- **Solana transactions expire after ~90 seconds** - Use Durable Nonces for scheduled transactions
- **LazorKit is devnet-only and beta** - Do not use in production; consider standard wallet adapter for mainnet
- Gasless transactions handled via LazorKit paymaster service

### Transaction Types & Color Coding
- Blue: Transfers
- Green: Swaps (via Jupiter DCA SDK)
- Purple: Staking

### Main Components

**`providers/CalenSolProvider.tsx`** - Wraps app with LazorkitProvider, handles Buffer polyfill for browser

**`hooks/useCalenSolWallet.ts`** - Main wallet hook exposing:
- Passkey connect/disconnect (Face ID/Touch ID)
- `sendSol()`, `sendToken()`, `sendUSDC()` - Gasless transfers
- Instruction builders for SOL and SPL token transfers
- Connection and balance utilities

### Database (Supabase)

Run `supabase-migration.sql` to set up schema:
- `users` - Wallet pubkeys, Google OAuth tokens
- `scheduled_transactions` - Transaction intents with status lifecycle (pending → ready → executing → completed/failed)
- `nonce_accounts` - Durable nonce management
- `execution_logs` - Transaction execution history

### External Services
- **Supabase**: Database + Row Level Security
- **Google Calendar API**: OAuth with `calendar.events` scope; transaction metadata stored in extended properties
- **LazorKit**: Passkey wallet SDK with paymaster for gasless transactions
- **Jupiter DCA SDK**: Scheduled swap execution
- **Vercel Cron**: Per-minute execution checks (requires Pro plan for production)

## Environment Variables

Required in `.env.local` (see `.env.example`):
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- LazorKit: `NEXT_PUBLIC_LAZORKIT_RPC_URL`, `NEXT_PUBLIC_LAZORKIT_PORTAL_URL`, `NEXT_PUBLIC_LAZORKIT_PAYMASTER_URL`
- Network: `NEXT_PUBLIC_SOLANA_NETWORK` (devnet/mainnet-beta)
- Security: `CRON_SECRET` for cron job authentication

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- @lazorkit/wallet
- @solana/web3.js, @solana/spl-token
- @jup-ag/dca-sdk
- @supabase/supabase-js
- googleapis
