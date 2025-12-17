'use client';

import { format } from 'date-fns';
import {
  Send,
  RefreshCw,
  Landmark,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import type { ScheduledTransaction } from '@/types';
import { useState } from 'react';

interface TransactionListProps {
  transactions: ScheduledTransaction[];
  onDelete?: (id: string) => void;
  onCancel?: (id: string) => void;
  isLoading?: boolean;
}

export function TransactionList({
  transactions,
  onDelete,
  onCancel,
  isLoading,
}: TransactionListProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const getTokenSymbol = (mint: string | null) => {
    if (!mint) return 'SOL';
    if (
      mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ||
      mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    )
      return 'USDC';
    return 'SPL';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'transfer':
        return <Send className="w-4 h-4" />;
      case 'swap':
        return <RefreshCw className="w-4 h-4" />;
      case 'stake':
        return <Landmark className="w-4 h-4" />;
      default:
        return <Send className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'executing':
        return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-blue-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'executing':
        return 'Executing';
      case 'cancelled':
        return 'Cancelled';
      case 'ready':
        return 'Ready';
      default:
        return 'Pending';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'executing':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'cancelled':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'transfer':
        return 'bg-blue-100 text-blue-600';
      case 'swap':
        return 'bg-green-100 text-green-600';
      case 'stake':
        return 'bg-purple-100 text-purple-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const truncateAddress = (addr: string | null) => {
    if (!addr) return 'N/A';
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading transactions...</span>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="text-center">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No scheduled transactions
          </h3>
          <p className="text-gray-500">
            Click on a date in the calendar to schedule your first transaction.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">
          Scheduled Transactions
        </h2>
      </div>

      <div className="divide-y divide-gray-100">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {/* Type icon */}
                <div
                  className={`p-2 rounded-lg ${getTypeColor(tx.transaction_type)}`}
                >
                  {getTypeIcon(tx.transaction_type)}
                </div>

                {/* Transaction details */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      {tx.amount} {getTokenSymbol(tx.token_mint)}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getStatusColor(tx.status)}`}
                    >
                      {getStatusText(tx.status)}
                    </span>
                  </div>

                  <div className="text-sm text-gray-500 space-y-0.5">
                    {tx.transaction_type === 'transfer' && tx.to_pubkey && (
                      <p>To: {truncateAddress(tx.to_pubkey)}</p>
                    )}
                    <p className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(tx.scheduled_at), 'MMM d, yyyy h:mm a')}
                    </p>
                    {tx.recurrence_rule && (
                      <p className="text-purple-600">
                        Recurring: {tx.recurrence_rule.replace('FREQ=', '')}
                      </p>
                    )}
                    {tx.memo && (
                      <p className="text-gray-400 italic">"{tx.memo}"</p>
                    )}
                  </div>

                  {/* Signature link */}
                  {tx.signature && (
                    <a
                      href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-xs text-purple-600 hover:text-purple-700"
                    >
                      View on Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {/* Error message */}
                  {tx.error_message && tx.status === 'failed' && (
                    <p className="mt-2 text-xs text-red-500">
                      Error: {tx.error_message}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions menu */}
              {['pending', 'failed'].includes(tx.status) && (
                <div className="relative">
                  <button
                    onClick={() =>
                      setOpenMenu(openMenu === tx.id ? null : tx.id)
                    }
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                  </button>

                  {openMenu === tx.id && (
                    <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                      {tx.status === 'pending' && onCancel && (
                        <button
                          onClick={() => {
                            onCancel(tx.id);
                            setOpenMenu(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancel
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => {
                            onDelete(tx.id);
                            setOpenMenu(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
