# CalenSol Development Plan

## Executive Summary

This document outlines a comprehensive development plan to ensure smooth development and production-readiness of CalenSol. Based on deep codebase analysis, we've identified **5 critical issues**, **8 high-priority items**, and **12 medium/low priority improvements**.

---

## Phase 0: Critical Security Fixes (MUST DO BEFORE ANY DEPLOYMENT)

### 0.1 Authentication & Authorization Vulnerabilities

| Issue | Current State | Fix Required |
|-------|--------------|--------------|
| Wallet as user identifier | Client sends wallet address, no verification | Require cryptographic signature |
| Cron secret bypass | Empty secret skips auth | Require secret, constant-time compare |
| RLS bypass | Admin client used everywhere | Use client with RLS enforcement |
| OAuth state leakage | Wallet address in state parameter | Use cryptographic nonce |

**Implementation Tasks:**

```
[ ] 0.1.1 Implement wallet signature verification middleware
[ ] 0.1.2 Fix cron authentication with constant-time comparison
[ ] 0.1.3 Refactor API routes to use RLS-enforced client
[ ] 0.1.4 Implement secure OAuth state management with sessions
[ ] 0.1.5 Add rate limiting to all public endpoints
```

**Files to Modify:**
- `/app/api/transactions/route.ts`
- `/app/api/transactions/[id]/route.ts`
- `/app/api/cron/execute/route.ts`
- `/app/api/auth/google/route.ts`
- `/app/api/auth/google/callback/route.ts`
- `/lib/supabase/server.ts`

### 0.2 Input Validation Fixes

| Issue | Location | Fix |
|-------|----------|-----|
| PublicKey validation | `useCalenSolWallet.ts:79,93` | Add try-catch validation |
| Recipient validation | `CreateTransactionModal.tsx:247` | Validate Solana address |
| Math precision | `useCalenSolWallet.ts:129` | Use BigInt multiplication |

**Implementation Tasks:**

```
[ ] 0.2.1 Create Solana address validation utility
[ ] 0.2.2 Add validation to all PublicKey instantiations
[ ] 0.2.3 Fix BigInt precision issues
[ ] 0.2.4 Add comprehensive Zod schemas for API routes
```

---

## Phase 1: Core Feature Completion (Week 1-2)

### 1.1 Durable Nonce Implementation

**Current State:** Database schema exists, library code exists, but never used.

**Why Critical:** Solana transactions expire in ~90 seconds. Without durable nonces, scheduled transactions will fail.

**Implementation Tasks:**

```
[ ] 1.1.1 Create nonce account management API
    - POST /api/nonce - Create nonce account
    - GET /api/nonce - List user's nonce accounts
    - DELETE /api/nonce/:id - Close nonce account

[ ] 1.1.2 Integrate nonce creation into transaction scheduling flow
    - When user schedules transaction, create/assign nonce account
    - Build durable transaction with nonce as blockhash
    - Store pre-signed transaction in database

[ ] 1.1.3 Update cron execution to use pre-signed transactions
    - Verify nonce is still valid before execution
    - Send pre-signed raw transaction
    - Advance nonce after successful execution

[ ] 1.1.4 Add nonce account cleanup for completed transactions
```

**Files to Create/Modify:**
- Create: `/app/api/nonce/route.ts`
- Create: `/app/api/nonce/[id]/route.ts`
- Modify: `/app/api/transactions/route.ts`
- Modify: `/app/api/cron/execute/route.ts`
- Modify: `/hooks/useCalenSolWallet.ts`

### 1.2 Transaction Pre-signing Flow

**Implementation Tasks:**

```
[ ] 1.2.1 Create pre-signing modal/flow in UI
    - User sees transaction preview
    - User signs with passkey
    - Transaction serialized and stored

[ ] 1.2.2 Implement transaction serialization endpoint
    - POST /api/transactions/:id/sign
    - Returns base64 encoded signed transaction

[ ] 1.2.3 Update CreateTransactionModal to include signing step

[ ] 1.2.4 Add transaction verification before storage
```

### 1.3 Cron Job Reliability

**Implementation Tasks:**

```
[ ] 1.3.1 Add transaction execution retry logic
    - Exponential backoff for failed transactions
    - Max 3 retries with increasing delays

[ ] 1.3.2 Implement execution locking
    - Prevent duplicate execution of same transaction
    - Use database advisory locks or similar

[ ] 1.3.3 Add health check endpoint
    - GET /api/health/cron
    - Returns last execution time, pending count

[ ] 1.3.4 Create local cron simulator for development
    - npm script to trigger cron endpoint manually
    - Optional auto-trigger every minute in dev mode
```

---

## Phase 2: Feature Completion (Week 2-3)

### 2.1 Jupiter DCA Swap Integration

**Current State:** Dependency installed but never used. Swap transactions throw error.

**Implementation Tasks:**

```
[ ] 2.1.1 Create Jupiter DCA service layer
    - lib/jupiter/dca.ts
    - Initialize DCA client
    - Create swap position
    - Cancel swap position
    - Query swap status

[ ] 2.1.2 Update transaction creation for swaps
    - Validate input/output mints
    - Calculate slippage
    - Create DCA position on scheduling

[ ] 2.1.3 Update cron execution for swaps
    - Check DCA position status
    - Update transaction status based on DCA execution

[ ] 2.1.4 Add swap UI components
    - Token selector
    - Slippage settings
    - Price impact warning
```

**Files to Create:**
- `/lib/jupiter/dca.ts`
- `/lib/jupiter/types.ts`
- `/components/SwapSettings.tsx`
- `/components/TokenSelector.tsx`

### 2.2 Staking Implementation

**Implementation Tasks:**

```
[ ] 2.2.1 Create Solana staking service layer
    - lib/solana/staking.ts
    - Create stake account
    - Delegate to validator
    - Deactivate stake
    - Withdraw stake

[ ] 2.2.2 Add validator selection UI
    - Fetch validator list from Solana
    - Display APY, commission

[ ] 2.2.3 Update cron execution for staking transactions
```

### 2.3 Complete Recurring Transaction Logic

**Current State:** Only handles DAILY, WEEKLY, MONTHLY. Missing INTERVAL, BYDAY, etc.

**Implementation Tasks:**

```
[ ] 2.3.1 Install and integrate rrule-js library
    npm install rrule

[ ] 2.3.2 Update calculateNextExecution function
    - Parse full RRULE spec
    - Handle complex patterns (every 2 weeks, specific days)

[ ] 2.3.3 Add recurring transaction UI
    - Visual preview of upcoming executions
    - End date/count configuration
```

---

## Phase 3: Notifications & Monitoring (Week 3-4)

### 3.1 Email Notifications

**Implementation Tasks:**

```
[ ] 3.1.1 Set up email service (Resend/SendGrid)
    - npm install resend
    - Configure API keys

[ ] 3.1.2 Create email templates
    - Transaction scheduled
    - Transaction executed
    - Transaction failed
    - Weekly summary

[ ] 3.1.3 Implement notification service
    - lib/notifications/email.ts
    - Queue-based sending

[ ] 3.1.4 Add notification preferences UI
    - Toggle email notifications
    - Select notification types
```

### 3.2 Push Notifications (Optional)

**Implementation Tasks:**

```
[ ] 3.2.1 Set up web push service
[ ] 3.2.2 Request push permission in UI
[ ] 3.2.3 Send push on transaction events
```

### 3.3 Monitoring & Observability

**Implementation Tasks:**

```
[ ] 3.3.1 Add structured logging
    - Use pino or similar
    - Include transaction IDs, user IDs
    - Log level configuration

[ ] 3.3.2 Create admin dashboard
    - Pending transaction count
    - Failed transaction list
    - Execution statistics

[ ] 3.3.3 Set up error tracking (Sentry)
    - npm install @sentry/nextjs
    - Configure error boundaries
    - Track unhandled errors

[ ] 3.3.4 Add metrics endpoint
    - GET /api/metrics
    - Prometheus format
```

---

## Phase 4: Production Hardening (Week 4-5)

### 4.1 Security Hardening

**Implementation Tasks:**

```
[ ] 4.1.1 Encrypt sensitive data at rest
    - Google tokens encryption
    - Use Supabase Vault or similar

[ ] 4.1.2 Add CSRF protection
    - Generate CSRF tokens
    - Validate on state-changing operations

[ ] 4.1.3 Implement rate limiting
    - Per-user rate limits
    - Global rate limits
    - Use Upstash or similar

[ ] 4.1.4 Add security headers
    - CSP, HSTS, etc.
    - next.config.js headers

[ ] 4.1.5 Audit dependencies
    - npm audit
    - Update vulnerable packages
```

### 4.2 Performance Optimization

**Implementation Tasks:**

```
[ ] 4.2.1 Add database query optimization
    - Review slow queries
    - Add missing indexes
    - Use connection pooling

[ ] 4.2.2 Implement caching
    - Cache token balances (short TTL)
    - Cache user preferences

[ ] 4.2.3 Optimize bundle size
    - Analyze with next-bundle-analyzer
    - Code split heavy dependencies
```

### 4.3 Error Handling Improvements

**Implementation Tasks:**

```
[ ] 4.3.1 Create global error boundary
[ ] 4.3.2 Add user-friendly error messages
[ ] 4.3.3 Implement graceful degradation
    - Calendar sync fails → transaction still works
    - Notification fails → log but continue
[ ] 4.3.4 Add retry mechanisms for external services
```

---

## Phase 5: Testing & Documentation (Ongoing)

### 5.1 Testing Improvements

**Implementation Tasks:**

```
[ ] 5.1.1 Add cron execution tests
    - Mock Solana transactions
    - Test retry logic
    - Test recurring creation

[ ] 5.1.2 Add integration tests
    - Full transaction lifecycle
    - OAuth flow
    - Calendar sync

[ ] 5.1.3 Add E2E tests with Playwright
    - User registration flow
    - Transaction scheduling flow
    - Dashboard interactions

[ ] 5.1.4 Set up CI/CD pipeline
    - Run tests on PR
    - Coverage reporting
    - Automatic deployment
```

### 5.2 Documentation

**Implementation Tasks:**

```
[ ] 5.2.1 Create API documentation
    - OpenAPI/Swagger spec
    - Example requests/responses

[ ] 5.2.2 Update README with setup guide
    - Local development
    - Environment configuration
    - Deployment instructions

[ ] 5.2.3 Create architecture diagrams
    - System overview
    - Data flow
    - Security model
```

---

## Environment Setup Checklist

### Required Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # NEVER commit this

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=           # NEVER commit this
GOOGLE_REDIRECT_URI=

# LazorKit (Devnet)
NEXT_PUBLIC_LAZORKIT_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_LAZORKIT_PORTAL_URL=https://portal.lazor.sh
NEXT_PUBLIC_LAZORKIT_PAYMASTER_URL=https://lazorkit-paymaster.onrender.com

# Network
NEXT_PUBLIC_SOLANA_NETWORK=devnet

# App URL (NEW - add to .env.example)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Security
CRON_SECRET=                    # Generate: openssl rand -hex 32

# Optional: Monitoring
SENTRY_DSN=
RESEND_API_KEY=
```

### Pre-deployment Checklist

```
[ ] All critical security fixes implemented (Phase 0)
[ ] Durable nonces working (Phase 1.1)
[ ] Pre-signing flow tested (Phase 1.2)
[ ] Test suite passing with >80% coverage
[ ] Security audit completed
[ ] Environment variables configured
[ ] Vercel Pro plan for cron jobs
[ ] Database migrations run
[ ] RLS policies verified
[ ] Error tracking configured
```

---

## Risk Matrix

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Transaction expiry | HIGH | HIGH | Implement durable nonces (Phase 1.1) |
| Unauthorized access | CRITICAL | MEDIUM | Auth fixes (Phase 0.1) |
| Cron job failure | HIGH | MEDIUM | Monitoring + fallback (Phase 3.3) |
| Calendar sync desync | MEDIUM | MEDIUM | Bidirectional sync (future) |
| LazorKit outage | HIGH | LOW | Add fallback to standard wallet |
| Database data loss | CRITICAL | LOW | Regular backups, RLS audit |

---

## Sprint Planning Recommendation

### Sprint 1 (Week 1-2)
- Phase 0: All critical security fixes
- Phase 1.1: Durable nonce implementation
- Phase 1.2: Transaction pre-signing

### Sprint 2 (Week 2-3)
- Phase 1.3: Cron job reliability
- Phase 2.1: Jupiter DCA swaps
- Phase 5.1.1-5.1.2: Cron and integration tests

### Sprint 3 (Week 3-4)
- Phase 2.2: Staking implementation
- Phase 2.3: Recurring transaction logic
- Phase 3.1: Email notifications

### Sprint 4 (Week 4-5)
- Phase 4.1: Security hardening
- Phase 4.2: Performance optimization
- Phase 4.3: Error handling
- Phase 5.1.3-5.1.4: E2E tests and CI/CD

### Sprint 5 (Week 5+)
- Phase 3.2: Push notifications
- Phase 3.3: Monitoring dashboard
- Phase 5.2: Documentation
- Bug fixes and polish

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Transaction success rate | >99% | Completed vs failed in DB |
| Calendar sync rate | >95% | Events created vs transactions |
| Test coverage | >80% | Jest coverage report |
| Security vulnerabilities | 0 critical, <3 high | Security audit |
| Cron execution time | <30s per transaction | Logs/metrics |
| User onboarding completion | >70% | Funnel tracking |

---

## Appendix: File-by-File Issue Map

### Critical Files Requiring Immediate Attention

| File | Issues | Priority |
|------|--------|----------|
| `/app/api/cron/execute/route.ts` | Auth bypass, missing nonce logic, swap stub | P0 |
| `/app/api/transactions/route.ts` | No auth verification, RLS bypass | P0 |
| `/hooks/useCalenSolWallet.ts` | PublicKey validation, BigInt precision | P0 |
| `/lib/supabase/server.ts` | Admin client overuse | P1 |
| `/app/api/auth/google/callback/route.ts` | State parameter leakage | P1 |

### Medium Priority Files

| File | Issues | Priority |
|------|--------|----------|
| `/components/CreateTransactionModal.tsx` | Recipient validation | P2 |
| `/lib/calendar.ts` | Missing bidirectional sync | P2 |
| `/lib/solana/nonce.ts` | Unused but correct code | P2 |

---

*Last Updated: December 17, 2025*
*Document Version: 1.0*
