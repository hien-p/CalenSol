# 📅 CalenSol - Calendar-Native Solana Wallet

> **Your Google Calendar is now your Solana Smart Wallet**

Schedule blockchain transactions as easily as scheduling a Zoom call. Built with LazorKit SDK for passkey authentication and gasless transactions.

![CalenSol Demo](https://via.placeholder.com/800x400?text=CalenSol+Demo)

## ✨ Features

- 🔐 **Passkey Authentication** - Face ID/Touch ID login via LazorKit
- ⛽ **Gasless Transactions** - No SOL needed for gas fees
- 📅 **Calendar Integration** - Schedule transactions like calendar events
- 🔄 **Recurring Payments** - Set and forget monthly payments
- 💱 **Token Swaps** - Schedule swaps via Jupiter DCA
- 🎨 **Color-Coded Events**:
  - 🔵 Blue: Transfers
  - 🟢 Green: Swaps
  - 🟣 Purple: Staking

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account
- Google Cloud Console project

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/calensol.git
cd calensol

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your keys

# Run development server
npm run dev
```

### Environment Setup

1. **Supabase**:
   - Create project at [supabase.com](https://supabase.com)
   - Run the SQL migration (see below)
   - Copy URL and keys to `.env.local`

2. **Google OAuth**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials
   - Add `http://localhost:3000/api/auth/google/callback` as redirect URI
   - Copy client ID and secret to `.env.local`

3. **LazorKit**:
   - Default devnet URLs are pre-configured
   - No additional setup needed for devnet

### Database Migration

Run this SQL in Supabase SQL Editor:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  smart_wallet_pubkey VARCHAR(44) UNIQUE,
  google_refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled transactions
CREATE TABLE scheduled_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  google_event_id VARCHAR(255),
  scheduled_at TIMESTAMPTZ NOT NULL,
  transaction_type VARCHAR(20) NOT NULL,
  from_pubkey VARCHAR(44) NOT NULL,
  to_pubkey VARCHAR(44),
  amount BIGINT NOT NULL,
  token_mint VARCHAR(44),
  status VARCHAR(20) DEFAULT 'pending',
  signature VARCHAR(88),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_transactions ENABLE ROW LEVEL SECURITY;
```

## 📖 Tutorials

### Tutorial 1: Create a Passkey Wallet

```tsx
import { useCalenSolWallet } from '@/hooks/useCalenSolWallet';

function WalletButton() {
  const { connect, disconnect, walletAddress, isConnected } = useCalenSolWallet();

  if (isConnected) {
    return (
      <div>
        <p>Connected: {walletAddress}</p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <button onClick={connect}>
      🔐 Connect with Passkey
    </button>
  );
}
```

### Tutorial 2: Send Gasless Transaction

```tsx
import { useCalenSolWallet } from '@/hooks/useCalenSolWallet';

function SendButton() {
  const { sendSol, sendUSDC, isConnected } = useCalenSolWallet();

  const handleSendSol = async () => {
    const signature = await sendSol(
      'RecipientAddressHere',
      0.1 // 0.1 SOL
    );
    console.log('Transaction:', signature);
  };

  const handleSendUSDC = async () => {
    const signature = await sendUSDC(
      'RecipientAddressHere',
      10 // 10 USDC
    );
    console.log('Transaction:', signature);
  };

  if (!isConnected) return <p>Connect wallet first</p>;

  return (
    <div>
      <button onClick={handleSendSol}>Send 0.1 SOL</button>
      <button onClick={handleSendUSDC}>Send 10 USDC</button>
    </div>
  );
}
```

### Tutorial 3: Schedule Transaction

```tsx
async function scheduleTransfer() {
  const response = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'transfer',
      scheduledAt: '2024-12-25T15:00:00Z',
      amount: 100,
      tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      recipient: 'RecipientAddressHere',
    }),
  });

  const { transaction } = await response.json();
  console.log('Scheduled:', transaction.id);
}
```

## 🏗️ Architecture

```
User creates calendar event
        ↓
Event saved to Google Calendar
(with transaction metadata in extended properties)
        ↓
Transaction intent saved to Supabase
        ↓
Vercel Cron checks every minute
        ↓
At scheduled time → Execute transaction
        ↓
Update calendar event status (✅ or ❌)
```

## 📁 Project Structure

```
calensol/
├── app/
│   ├── api/
│   │   ├── auth/google/       # OAuth endpoints
│   │   ├── transactions/      # Transaction CRUD
│   │   └── cron/execute/      # Cron job endpoint
│   └── dashboard/             # Main UI
├── components/                # React components
├── hooks/
│   └── useCalenSolWallet.ts   # Main wallet hook
├── lib/
│   ├── google.ts              # Google Calendar client
│   └── supabase/              # Supabase client
├── providers/
│   └── CalenSolProvider.tsx   # LazorKit provider
└── vercel.json                # Cron configuration
```

## 🔧 Configuration

### Vercel Cron (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/execute",
      "schedule": "* * * * *"
    }
  ]
}
```

### Environment Variables

See `.env.example` for all required variables.

## 🛡️ Security

- Pre-signed transactions with durable nonces
- Encrypted token storage
- Row-level security in Supabase
- CRON_SECRET for cron job authentication
- No private keys stored

## 🌐 Deployment

```bash
# Deploy to Vercel
vercel --prod

# Set environment variables in Vercel dashboard
# Cron jobs only run on production deployment
```

## 📄 License

MIT

## 🙏 Credits

- [LazorKit](https://lazorkit.com) - Passkey wallet SDK
- [Solana](https://solana.com) - Blockchain
- [Jupiter](https://jup.ag) - DCA/Swap aggregator
- [Supabase](https://supabase.com) - Database
- [Google Calendar API](https://developers.google.com/calendar)

---

**Built for LazorKit SDK Bounty** 🏆
