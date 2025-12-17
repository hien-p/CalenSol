/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/transactions/route';

// Mock Supabase
const mockSupabaseSelect = jest.fn();
const mockSupabaseInsert = jest.fn();
const mockSupabaseUpdate = jest.fn();
const mockSupabaseEq = jest.fn();
const mockSupabaseSingle = jest.fn();
const mockSupabaseOrder = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: jest.fn((table: string) => ({
      select: mockSupabaseSelect.mockReturnThis(),
      insert: mockSupabaseInsert.mockReturnThis(),
      update: mockSupabaseUpdate.mockReturnThis(),
      eq: mockSupabaseEq.mockReturnThis(),
      single: mockSupabaseSingle,
      order: mockSupabaseOrder.mockReturnThis(),
    })),
  }),
}));

// Mock calendar functions
jest.mock('@/lib/calendar', () => ({
  createCalendarEvent: jest.fn().mockResolvedValue({ id: 'event-123' }),
  generateEventTitle: jest.fn().mockReturnValue('Send 100 SOL to ABC...XYZ'),
}));

// Mock google functions
jest.mock('@/lib/google', () => ({
  getValidAccessToken: jest.fn().mockResolvedValue({
    accessToken: 'valid-token',
    expiryDate: new Date(Date.now() + 3600000).toISOString(),
  }),
}));

describe('API /api/transactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/transactions', () => {
    it('should return 400 if wallet address is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/transactions');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Wallet address is required');
    });

    it('should return 404 if user not found', async () => {
      mockSupabaseSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      const request = new NextRequest(
        'http://localhost:3000/api/transactions?wallet=test-wallet'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('should return transactions for valid user', async () => {
      const mockUser = { id: 'user-123' };
      const mockTransactions = [
        { id: 'tx-1', amount: 100, status: 'pending' },
        { id: 'tx-2', amount: 200, status: 'completed' },
      ];

      mockSupabaseSingle.mockResolvedValueOnce({ data: mockUser, error: null });
      mockSupabaseOrder.mockReturnValueOnce({
        data: mockTransactions,
        error: null,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/transactions?wallet=test-wallet'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.transactions).toEqual(mockTransactions);
    });

    it('should filter by status if provided', async () => {
      const mockUser = { id: 'user-123' };
      mockSupabaseSingle.mockResolvedValueOnce({ data: mockUser, error: null });
      mockSupabaseOrder.mockReturnValueOnce({ data: [], error: null });

      const request = new NextRequest(
        'http://localhost:3000/api/transactions?wallet=test-wallet&status=pending'
      );

      await GET(request);

      expect(mockSupabaseEq).toHaveBeenCalledWith('status', 'pending');
    });
  });

  describe('POST /api/transactions', () => {
    const validBody = {
      walletAddress: 'test-wallet-address',
      type: 'transfer',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      amount: 100,
      recipient: 'recipient-address',
    };

    it('should return 400 if wallet address is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        body: JSON.stringify({ type: 'transfer', amount: 100 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Wallet address is required');
    });

    it('should return 400 for invalid input', async () => {
      const request = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          walletAddress: 'test-wallet',
          type: 'invalid-type',
          amount: -100,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid input');
    });

    it('should return 404 if user not found', async () => {
      mockSupabaseSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      const request = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
    });

    it('should create transaction successfully', async () => {
      const mockUser = {
        id: 'user-123',
        google_refresh_token: 'refresh-token',
        google_access_token: 'access-token',
        google_token_expiry: new Date(Date.now() + 3600000).toISOString(),
        google_calendar_id: 'primary',
      };

      const mockTransaction = {
        id: 'tx-new',
        ...validBody,
        status: 'pending',
      };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null }) // Get user
        .mockResolvedValueOnce({ data: mockTransaction, error: null }); // Insert transaction

      mockSupabaseUpdate.mockReturnValueOnce({
        eq: jest.fn().mockResolvedValueOnce({ error: null }),
      });

      const request = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.transaction).toBeDefined();
    });

    it('should create calendar event when Google connected', async () => {
      const { createCalendarEvent } = require('@/lib/calendar');

      const mockUser = {
        id: 'user-123',
        google_refresh_token: 'refresh-token',
        google_access_token: 'access-token',
        google_token_expiry: new Date(Date.now() + 3600000).toISOString(),
        google_calendar_id: 'primary',
      };

      const mockTransaction = {
        id: 'tx-new',
        status: 'pending',
      };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null })
        .mockResolvedValueOnce({ data: mockTransaction, error: null });

      const request = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });

      await POST(request);

      expect(createCalendarEvent).toHaveBeenCalled();
    });

    it('should handle swap transaction type', async () => {
      const mockUser = {
        id: 'user-123',
        google_refresh_token: null,
        google_calendar_id: 'primary',
      };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null })
        .mockResolvedValueOnce({ data: { id: 'tx-swap' }, error: null });

      const swapBody = {
        walletAddress: 'test-wallet',
        type: 'swap',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        amount: 100,
        inputMint: 'input-mint',
        outputMint: 'output-mint',
        slippageBps: 100,
      };

      const request = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        body: JSON.stringify(swapBody),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle recurring transactions', async () => {
      const mockUser = {
        id: 'user-123',
        google_refresh_token: null,
        google_calendar_id: 'primary',
      };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null })
        .mockResolvedValueOnce({ data: { id: 'tx-recurring' }, error: null });

      const recurringBody = {
        ...validBody,
        recurrenceRule: 'FREQ=WEEKLY',
      };

      const request = new NextRequest('http://localhost:3000/api/transactions', {
        method: 'POST',
        body: JSON.stringify(recurringBody),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });
});

describe('API /api/transactions/[id]', () => {
  // Import the route handlers
  const {
    GET: getById,
    PATCH,
    DELETE,
  } = require('@/app/api/transactions/[id]/route');

  describe('GET /api/transactions/[id]', () => {
    it('should return 400 if wallet address is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/transactions/tx-123'
      );

      const response = await getById(request, { params: Promise.resolve({ id: 'tx-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
    });

    it('should return transaction by ID', async () => {
      const mockUser = { id: 'user-123' };
      const mockTransaction = { id: 'tx-123', amount: 100 };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null })
        .mockResolvedValueOnce({ data: mockTransaction, error: null });

      const request = new NextRequest(
        'http://localhost:3000/api/transactions/tx-123?wallet=test-wallet'
      );

      const response = await getById(request, { params: Promise.resolve({ id: 'tx-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.transaction).toEqual(mockTransaction);
    });
  });

  describe('PATCH /api/transactions/[id]', () => {
    it('should update transaction', async () => {
      const mockUser = { id: 'user-123' };
      const existingTx = { id: 'tx-123', status: 'pending' };
      const updatedTx = { id: 'tx-123', status: 'pending', memo: 'updated' };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null })
        .mockResolvedValueOnce({ data: existingTx, error: null })
        .mockResolvedValueOnce({ data: updatedTx, error: null });

      const request = new NextRequest(
        'http://localhost:3000/api/transactions/tx-123',
        {
          method: 'PATCH',
          body: JSON.stringify({
            walletAddress: 'test-wallet',
            memo: 'updated',
          }),
        }
      );

      const response = await PATCH(request, { params: Promise.resolve({ id: 'tx-123' }) });

      expect(response.status).toBe(200);
    });

    it('should not allow updates to non-pending transactions', async () => {
      const mockUser = { id: 'user-123' };
      const existingTx = { id: 'tx-123', status: 'completed' };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null })
        .mockResolvedValueOnce({ data: existingTx, error: null });

      const request = new NextRequest(
        'http://localhost:3000/api/transactions/tx-123',
        {
          method: 'PATCH',
          body: JSON.stringify({
            walletAddress: 'test-wallet',
            memo: 'updated',
          }),
        }
      );

      const response = await PATCH(request, { params: Promise.resolve({ id: 'tx-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Can only update pending transactions');
    });
  });

  describe('DELETE /api/transactions/[id]', () => {
    it('should delete pending transaction', async () => {
      const mockUser = { id: 'user-123' };
      const mockTransaction = { id: 'tx-123', status: 'pending' };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null })
        .mockResolvedValueOnce({ data: mockTransaction, error: null });

      mockSupabaseEq.mockReturnValueOnce({ error: null });

      const request = new NextRequest(
        'http://localhost:3000/api/transactions/tx-123?wallet=test-wallet',
        { method: 'DELETE' }
      );

      const response = await DELETE(request, { params: Promise.resolve({ id: 'tx-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should not delete executing transaction', async () => {
      const mockUser = { id: 'user-123' };
      const mockTransaction = { id: 'tx-123', status: 'executing' };

      mockSupabaseSingle
        .mockResolvedValueOnce({ data: mockUser, error: null })
        .mockResolvedValueOnce({ data: mockTransaction, error: null });

      const request = new NextRequest(
        'http://localhost:3000/api/transactions/tx-123?wallet=test-wallet',
        { method: 'DELETE' }
      );

      const response = await DELETE(request, { params: Promise.resolve({ id: 'tx-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot delete transaction in current status');
    });
  });
});
