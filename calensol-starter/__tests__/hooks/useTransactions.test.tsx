import { renderHook, waitFor, act } from '@testing-library/react';
import { useTransactions } from '@/hooks/useTransactions';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('hooks/useTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockTransactions = [
    {
      id: 'tx-1',
      user_id: 'user-1',
      transaction_type: 'transfer',
      scheduled_at: '2024-12-25T15:00:00Z',
      amount: 100,
      token_mint: null,
      to_pubkey: 'recipient-1',
      status: 'pending',
      from_pubkey: 'sender-1',
    },
    {
      id: 'tx-2',
      user_id: 'user-1',
      transaction_type: 'swap',
      scheduled_at: '2024-12-26T15:00:00Z',
      amount: 50,
      token_mint: 'USDC-mint',
      status: 'completed',
      from_pubkey: 'sender-1',
      signature: 'tx-sig-123',
    },
  ];

  describe('initial state', () => {
    it('should have empty transactions when no wallet address', () => {
      const { result } = renderHook(() =>
        useTransactions({ walletAddress: null })
      );

      expect(result.current.transactions).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('fetching transactions', () => {
    it('should fetch transactions when wallet address is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      const { result } = renderHook(() =>
        useTransactions({ walletAddress: 'test-wallet-address' })
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.transactions).toEqual(mockTransactions);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/transactions?wallet=test-wallet-address'
      );
    });

    it('should include status filter in query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: [] }),
      });

      renderHook(() =>
        useTransactions({
          walletAddress: 'test-wallet',
          status: 'pending',
        })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/transactions?wallet=test-wallet&status=pending'
        );
      });
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to fetch' }),
      });

      const { result } = renderHook(() =>
        useTransactions({ walletAddress: 'test-wallet' })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch');
      });

      expect(result.current.transactions).toEqual([]);
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useTransactions({ walletAddress: 'test-wallet' })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });
    });
  });

  describe('auto refresh', () => {
    it('should auto refresh when enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      renderHook(() =>
        useTransactions({
          walletAddress: 'test-wallet',
          autoRefresh: true,
          refreshInterval: 5000,
        })
      );

      // Initial fetch
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Advance timer
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('should not auto refresh when disabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ transactions: [] }),
      });

      renderHook(() =>
        useTransactions({
          walletAddress: 'test-wallet',
          autoRefresh: false,
        })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      act(() => {
        jest.advanceTimersByTime(60000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not auto refresh without wallet address', async () => {
      renderHook(() =>
        useTransactions({
          walletAddress: null,
          autoRefresh: true,
          refreshInterval: 1000,
        })
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('refresh function', () => {
    it('should manually refresh transactions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      const { result } = renderHook(() =>
        useTransactions({
          walletAddress: 'test-wallet',
          autoRefresh: false,
        })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteTransaction', () => {
    it('should delete transaction and update state', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactions: mockTransactions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      const { result } = renderHook(() =>
        useTransactions({ walletAddress: 'test-wallet' })
      );

      await waitFor(() => {
        expect(result.current.transactions).toHaveLength(2);
      });

      let success: boolean;
      await act(async () => {
        success = await result.current.deleteTransaction('tx-1');
      });

      expect(success!).toBe(true);
      expect(result.current.transactions).toHaveLength(1);
      expect(result.current.transactions[0].id).toBe('tx-2');
    });

    it('should return false on delete error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactions: mockTransactions }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Delete failed' }),
        });

      const { result } = renderHook(() =>
        useTransactions({ walletAddress: 'test-wallet' })
      );

      await waitFor(() => {
        expect(result.current.transactions).toHaveLength(2);
      });

      let success: boolean;
      await act(async () => {
        success = await result.current.deleteTransaction('tx-1');
      });

      expect(success!).toBe(false);
      expect(result.current.error).toBe('Delete failed');
      // Transactions should not be modified
      expect(result.current.transactions).toHaveLength(2);
    });

    it('should return false without wallet address', async () => {
      const { result } = renderHook(() =>
        useTransactions({ walletAddress: null })
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.deleteTransaction('tx-1');
      });

      expect(success!).toBe(false);
    });
  });

  describe('cancelTransaction', () => {
    it('should cancel transaction and update state', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactions: mockTransactions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transaction: { ...mockTransactions[0], status: 'cancelled' } }),
        });

      const { result } = renderHook(() =>
        useTransactions({ walletAddress: 'test-wallet' })
      );

      await waitFor(() => {
        expect(result.current.transactions).toHaveLength(2);
      });

      let success: boolean;
      await act(async () => {
        success = await result.current.cancelTransaction('tx-1');
      });

      expect(success!).toBe(true);
      expect(result.current.transactions[0].status).toBe('cancelled');
    });

    it('should send PATCH request with correct body', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactions: mockTransactions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transaction: {} }),
        });

      const { result } = renderHook(() =>
        useTransactions({ walletAddress: 'test-wallet' })
      );

      await waitFor(() => {
        expect(result.current.transactions).toHaveLength(2);
      });

      await act(async () => {
        await result.current.cancelTransaction('tx-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/transactions/tx-1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: 'test-wallet',
            status: 'cancelled',
          }),
        }
      );
    });

    it('should return false on cancel error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ transactions: mockTransactions }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'Cancel failed' }),
        });

      const { result } = renderHook(() =>
        useTransactions({ walletAddress: 'test-wallet' })
      );

      await waitFor(() => {
        expect(result.current.transactions).toHaveLength(2);
      });

      let success: boolean;
      await act(async () => {
        success = await result.current.cancelTransaction('tx-1');
      });

      expect(success!).toBe(false);
      expect(result.current.error).toBe('Cancel failed');
    });

    it('should return false without wallet address', async () => {
      const { result } = renderHook(() =>
        useTransactions({ walletAddress: null })
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.cancelTransaction('tx-1');
      });

      expect(success!).toBe(false);
    });
  });

  describe('wallet address change', () => {
    it('should refetch when wallet address changes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      const { result, rerender } = renderHook(
        ({ walletAddress }) => useTransactions({ walletAddress }),
        { initialProps: { walletAddress: 'wallet-1' } }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      rerender({ walletAddress: 'wallet-2' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/transactions?wallet=wallet-2'
      );
    });

    it('should clear transactions when wallet disconnects', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: mockTransactions }),
      });

      const { result, rerender } = renderHook(
        ({ walletAddress }) => useTransactions({ walletAddress }),
        { initialProps: { walletAddress: 'wallet-1' as string | null } }
      );

      await waitFor(() => {
        expect(result.current.transactions).toHaveLength(2);
      });

      rerender({ walletAddress: null });

      expect(result.current.transactions).toEqual([]);
    });
  });
});
