'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ScheduledTransaction } from '@/types';

interface UseTransactionsOptions {
  walletAddress?: string | null;
  status?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseTransactionsReturn {
  transactions: ScheduledTransaction[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  deleteTransaction: (id: string) => Promise<boolean>;
  cancelTransaction: (id: string) => Promise<boolean>;
}

export function useTransactions({
  walletAddress,
  status,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
}: UseTransactionsOptions): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<ScheduledTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!walletAddress) {
      setTransactions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ wallet: walletAddress });
      if (status) {
        params.append('status', status);
      }

      const response = await fetch(`/api/transactions?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch transactions');
      }

      setTransactions(data.transactions || []);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, status]);

  // Initial fetch
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh || !walletAddress) return;

    const interval = setInterval(fetchTransactions, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, walletAddress, refreshInterval, fetchTransactions]);

  const deleteTransaction = useCallback(
    async (id: string): Promise<boolean> => {
      if (!walletAddress) return false;

      try {
        const response = await fetch(
          `/api/transactions/${id}?wallet=${walletAddress}`,
          {
            method: 'DELETE',
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to delete transaction');
        }

        // Remove from local state
        setTransactions((prev) => prev.filter((tx) => tx.id !== id));
        return true;
      } catch (err) {
        console.error('Failed to delete transaction:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete transaction');
        return false;
      }
    },
    [walletAddress]
  );

  const cancelTransaction = useCallback(
    async (id: string): Promise<boolean> => {
      if (!walletAddress) return false;

      try {
        const response = await fetch(`/api/transactions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            status: 'cancelled',
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to cancel transaction');
        }

        // Update local state
        setTransactions((prev) =>
          prev.map((tx) =>
            tx.id === id ? { ...tx, status: 'cancelled' } : tx
          )
        );
        return true;
      } catch (err) {
        console.error('Failed to cancel transaction:', err);
        setError(err instanceof Error ? err.message : 'Failed to cancel transaction');
        return false;
      }
    },
    [walletAddress]
  );

  return {
    transactions,
    isLoading,
    error,
    refresh: fetchTransactions,
    deleteTransaction,
    cancelTransaction,
  };
}
