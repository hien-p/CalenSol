# CalenSol: Building a Calendar-Native Solana Wallet

A Google Calendar-native wallet that schedules blockchain transactions represents a **genuine white space opportunity**—no existing product combines calendar UX with crypto transaction management. This report provides the technical foundation for a 1-week MVP build using Next.js.

## The critical technical constraints shape everything

Solana transactions expire after **~90 seconds** (150 blocks), making scheduled execution fundamentally challenging. Unlike Cardano's validity intervals, Solana requires external infrastructure to trigger future transactions. The solution is **Durable Nonces**—special on-chain accounts that create transactions valid indefinitely until executed.

**Clockwork protocol shut down in October 2023**, eliminating what was the primary automation solution. Its successor, **Tuk Tuk by Helium**, now handles on-chain scheduling. For swaps specifically, **Jupiter's DCA SDK** provides battle-tested scheduled execution with a 0.1% fee.

LazorKit's passkey-based wallet SDK offers compelling UX (Face ID/Touch ID, no seed phrases, gasless transactions) but is **currently devnet-only and beta**. For a production MVP, consider starting with standard wallet adapter and adding LazorKit when mainnet support launches.

## Architecture: Pre-signed transactions with Vercel cron

The recommended MVP architecture connects three systems through a central execution engine:

```
Google Calendar → Calendar Event Created → Store Transaction Intent (PostgreSQL)
                                                      ↓
                                           Vercel Cron (per-minute)
                                                      ↓
                                           Check pending transactions
                                                      ↓
                                           Execute pre-signed tx OR
                                           Build fresh tx for swaps
                                                      ↓
                                           Update calendar event status
```

**Pre-signed transactions with Durable Nonces** work best for simple transfers: the user signs once when scheduling, the serialized transaction is stored encrypted, and the cron job broadcasts it at the scheduled time. For swaps, **just-in-time execution** via Jupiter API allows current price data and slippage protection.

```typescript
// Creating a durable nonce for scheduled transfer
const tx = new Transaction();
tx.add(SystemProgram.nonceAdvance({
  noncePubkey: nonceAccount.publicKey,
  authorizedPubkey: userPubkey,
}));
tx.add(transferInstruction);
tx.recentBlockhash = nonceAccountInfo.nonce; // Use nonce instead of blockhash
// User signs → Store serialized tx → Execute later via cron
```

**Vercel cron jobs** provide zero-infrastructure scheduling at per-minute granularity (Pro plan, $20/month). The cron endpoint queries pending transactions, checks if scheduled time has passed, and executes.

## Google Calendar API integration patterns

Calendar integration requires **server-side OAuth** with `calendar.events` scope. The key insight: **Extended Properties** let you store up to 32KB of custom metadata per event—perfect for transaction data.

```typescript
// Store Solana transaction data in calendar event
const event = {
  summary: "Send 10 SOL to alice.sol",
  start: { dateTime: scheduledTime.toISOString() },
  extendedProperties: {
    private: {
      solanaTransactionId: txIntent.id,
      transactionType: "transfer",
      amount: "10000000000",
      recipient: "alice.sol",
      status: "pending"
    }
  }
};
await calendar.events.insert({ calendarId: 'primary', requestBody: event });
```

**Webhooks** notify your app when events change, though they only signal *that* something changed—you must fetch the actual changes using **incremental sync with sync tokens**. Webhook channels expire in ~7 days and need proactive renewal.

The OAuth flow requires `prompt: 'consent'` and `access_type: 'offline'` to always receive refresh tokens—Google only issues refresh tokens on first authorization otherwise.

## Scheduling mechanisms comparison

| Solution | Best For | Status | Complexity |
|----------|----------|--------|------------|
| **Jupiter DCA SDK** | Scheduled swaps | Active, audited | Easy |
| **Tuk Tuk (Helium)** | General automation | Active | Medium |
| **Vercel Cron + Durable Nonces** | Simple transfers | DIY | Medium |
| **Streamflow** | Recurring payments, vesting | Active | Easy |
| ~~Clockwork~~ | ~~General automation~~ | **Dead** | N/A |

For the MVP, combine **Jupiter DCA** for swap scheduling (they handle all the infrastructure) with **Vercel cron + durable nonces** for simple transfers. This hybrid approach maximizes reliability while minimizing infrastructure.

```typescript
// Scheduled swap via Jupiter DCA
const params = {
  payer: user.publicKey,
  inAmount: BigInt(1_000_000_000), // 1000 USDC
  inAmountPerCycle: BigInt(100_000_000), // 100 USDC per execution
  cycleSecondsApart: BigInt(86400), // Daily
  inputMint: USDC_MINT,
  outputMint: SOL_MINT,
  startAt: Math.floor(scheduledDate.getTime() / 1000),
};
const { tx, dcaPubKey } = await dca.createDcaV2(params);
```

## Database schema for transaction lifecycle

```sql
CREATE TABLE scheduled_transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  google_calendar_event_id VARCHAR(255),
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  recurrence_rule VARCHAR(255), -- RFC 5545 RRULE
  
  -- Transaction
  transaction_type VARCHAR(20), -- transfer, swap, stake
  params JSONB NOT NULL,
  presigned_tx_encrypted BYTEA,
  nonce_account_pubkey VARCHAR(44),
  
  -- State machine
  status VARCHAR(20) DEFAULT 'pending',
  -- pending → ready → executing → completed/failed
  
  signature VARCHAR(88), -- Solana tx signature
  executed_at TIMESTAMPTZ
);
```

Track transaction state through a clear lifecycle: **pending** (created) → **ready** (T-5 minutes) → **executing** → **completed/failed**. Log all state transitions for debugging and user transparency.

## Security model and mitigations

The primary risks for scheduled transactions are **replay attacks**, **stale transaction data**, and **MEV/sandwich attacks** on swaps.

**Replay protection** comes automatically from durable nonces—the nonce advances when used, invalidating any copies of the pre-signed transaction. Never reuse nonce accounts.

**Stale data protection** for swaps requires slippage tolerance and price guards:

```typescript
const swapIntent = {
  slippageTolerance: 0.01, // 1%
  minOutputAmount: calculateMinOutput(amount, currentPrice, slippage),
  priceAtCreation: currentPrice,
  maxPriceDeviation: 0.05, // Cancel if price moves >5%
};
```

**Never store private keys**. The pre-signing model keeps users in control—they sign with their own wallet, you only store the serialized signed transaction (encrypted at rest). For higher security, consider **session keys** that delegate limited permissions to an ephemeral keypair.

## LazorKit SDK integration (when ready)

LazorKit provides passkey-based authentication through WebAuthn, creating a **smart wallet on-chain** that validates secp256r1 signatures. The SDK includes gasless transactions via a paymaster service.

```tsx
import { LazorkitProvider, useWallet } from '@lazorkit/wallet';

function App() {
  return (
    <LazorkitProvider
      rpcUrl="https://api.devnet.solana.com"
      paymasterUrl="https://lazorkit-paymaster.onrender.com"
    >
      <WalletButton />
    </LazorkitProvider>
  );
}

function WalletButton() {
  const { connect, signAndSendTransaction, smartWalletPubkey } = useWallet();
  // Face ID/Touch ID authentication, no seed phrases
}
```

**Critical limitation**: LazorKit is **devnet-only and explicitly beta**. The team states "Do not use in production level!" For the MVP, use standard `@solana/wallet-adapter` with Phantom/Solflare, and plan to integrate LazorKit when mainnet launches.

## Competitive landscape reveals clear opportunity

**No existing calendar-native crypto wallet exists.** Current "crypto calendars" track industry events (CoinMarketCal, Coindar), not transactions. Scheduling features exist within DeFi apps (Jupiter DCA, Streamflow) but none integrate with Google Calendar.

Existing solutions to learn from:

- **Jupiter DCA**: Clean progress indicators, order status tracking, cancel/modify options
- **Streamflow**: Vesting schedules with cliff visualization, multi-recipient batching
- **Superfluid** (Ethereum): Real-time balance updates that change every second
- **Sablier**: NFT-wrapped streams tradeable on OpenSea

CalenSol's differentiation: **calendar-based visual scheduling** leveraging Google Calendar's familiar UX, unified view across transaction types, and native reminder/notification integration.

## One-week MVP implementation roadmap

**Days 1-2: Foundation**
- Supabase project with schema (users, wallets, scheduled_transactions)
- Next.js 14 app with `@solana/wallet-adapter`
- Google OAuth with `calendar.events` scope
- Basic calendar event CRUD

**Days 3-4: Core transaction logic**
- Durable nonce account creation flow
- Pre-signed transaction builder for transfers
- Jupiter DCA integration for swaps
- Transaction intent API (create, read, cancel)

**Days 5-6: Execution engine**
- Vercel cron job checking pending transactions
- Broadcast pre-signed transactions at scheduled time
- Status sync back to calendar events
- Error handling and retry logic

**Day 7: Polish**
- Calendar UI with transaction visualization
- Pending transaction list with status
- Notification system (email via Resend)
- Security hardening (encrypted storage, input validation)

## Recommended tech stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL + Auth) |
| Scheduling | Vercel Cron Jobs |
| Solana RPC | Helius (free tier) |
| Wallet | @solana/wallet-adapter |
| Swaps | Jupiter API + DCA SDK |
| Payments | Streamflow SDK (if vesting needed) |
| Calendar | Google Calendar API (googleapis) |

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "@supabase/supabase-js": "^2.39.0",
    "@solana/web3.js": "^1.87.0",
    "@solana/wallet-adapter-react": "^0.15.0",
    "@jup-ag/dca-sdk": "^1.0.0",
    "googleapis": "^129.0.0"
  }
}
```

## Conclusion

CalenSol addresses a genuine market gap by bringing Google Calendar's intuitive scheduling UX to blockchain transactions. The technical path is clear: **durable nonces for pre-signed transfers**, **Jupiter DCA for scheduled swaps**, and **Vercel cron for execution orchestration**. The MVP can ship in one week by focusing on the core loop: create calendar event → store transaction intent → execute at scheduled time → update status.

The biggest risk is LazorKit's mainnet timeline—plan for standard wallet adapter initially with passkey integration as a future enhancement. Solana's low fees and fast finality make it ideal for frequent scheduled transactions, and the competitive vacuum means first-mover advantage is available.