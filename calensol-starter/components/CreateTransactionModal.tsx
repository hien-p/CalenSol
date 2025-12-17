'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  X,
  Calendar,
  Send,
  RefreshCw,
  Landmark,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useCalenSolWallet } from '@/hooks/useCalenSolWallet';
import { RECURRENCE_OPTIONS } from '@/types';

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
  onSuccess,
}: CreateTransactionModalProps) {
  const { walletAddress } = useCalenSolWallet();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    type: 'transfer' as 'transfer' | 'swap' | 'stake',
    recipient: '',
    amount: '',
    token: 'SOL',
    date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '',
    time: '12:00',
    recurring: false,
    recurrenceRule: 'FREQ=WEEKLY',
    memo: '',
  });

  // Update date when selectedDate changes
  useState(() => {
    if (selectedDate) {
      setFormData((prev) => ({
        ...prev,
        date: format(selectedDate, 'yyyy-MM-dd'),
      }));
    }
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!walletAddress) {
        throw new Error('Please connect your wallet first');
      }

      const scheduledAt = new Date(`${formData.date}T${formData.time}:00`);

      if (scheduledAt <= new Date()) {
        throw new Error('Scheduled time must be in the future');
      }

      const tokenMint =
        formData.token === 'USDC'
          ? process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta'
            ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
            : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
          : undefined;

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          type: formData.type,
          scheduledAt: scheduledAt.toISOString(),
          amount: parseFloat(formData.amount),
          tokenMint,
          recipient: formData.type === 'transfer' ? formData.recipient : undefined,
          recurrenceRule: formData.recurring ? formData.recurrenceRule : undefined,
          memo: formData.memo || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create transaction');
      }

      // Reset form
      setFormData({
        type: 'transfer',
        recipient: '',
        amount: '',
        token: 'SOL',
        date: '',
        time: '12:00',
        recurring: false,
        recurrenceRule: 'FREQ=WEEKLY',
        memo: '',
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to create transaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to create transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Schedule Transaction
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transaction Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, type: 'transfer' }))}
                className={`
                  flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all
                  ${
                    formData.type === 'transfer'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }
                `}
              >
                <Send className="w-5 h-5" />
                <span className="text-xs font-medium">Transfer</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, type: 'swap' }))}
                className={`
                  flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all
                  ${
                    formData.type === 'swap'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }
                `}
              >
                <RefreshCw className="w-5 h-5" />
                <span className="text-xs font-medium">Swap</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, type: 'stake' }))}
                className={`
                  flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all
                  ${
                    formData.type === 'stake'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'
                  }
                `}
              >
                <Landmark className="w-5 h-5" />
                <span className="text-xs font-medium">Stake</span>
              </button>
            </div>
          </div>

          {/* Amount & Token */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={formData.amount}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, amount: e.target.value }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
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
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, token: e.target.value }))
                }
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all bg-white"
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
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, recipient: e.target.value }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all font-mono text-sm"
                placeholder="Solana wallet address"
                required
              />
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Date
                </span>
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, date: e.target.value }))
                }
                min={format(new Date(), 'yyyy-MM-dd')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Time
                </span>
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, time: e.target.value }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          {/* Recurring Toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.recurring}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, recurring: e.target.checked }))
              }
              className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Make this a recurring transaction
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
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    recurrenceRule: e.target.value,
                  }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all bg-white"
              >
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Memo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Memo (optional)
            </label>
            <input
              type="text"
              value={formData.memo}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, memo: e.target.value }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
              placeholder="Add a note..."
              maxLength={100}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || !walletAddress}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                Schedule Transaction
              </>
            )}
          </button>

          {!walletAddress && (
            <p className="text-center text-sm text-gray-500">
              Please connect your wallet to schedule transactions
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
