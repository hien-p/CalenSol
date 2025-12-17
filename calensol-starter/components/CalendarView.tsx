'use client';

import { useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Send, RefreshCw, Landmark, Plus } from 'lucide-react';
import type { ScheduledTransaction } from '@/types';

interface CalendarViewProps {
  transactions: ScheduledTransaction[];
  onDateClick: (date: Date) => void;
  onTransactionClick?: (transaction: ScheduledTransaction) => void;
}

export function CalendarView({
  transactions,
  onDateClick,
  onTransactionClick,
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getTransactionsForDay = (day: Date) => {
    return transactions.filter((tx) =>
      isSameDay(new Date(tx.scheduled_at), day)
    );
  };

  const getTokenSymbol = (mint: string | null) => {
    if (!mint) return 'SOL';
    if (
      mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ||
      mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    )
      return 'USDC';
    return 'SPL';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'executing':
        return 'bg-yellow-500 animate-pulse';
      case 'cancelled':
        return 'bg-gray-400';
      default:
        return 'bg-blue-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'transfer':
        return <Send className="w-3 h-3" />;
      case 'swap':
        return <RefreshCw className="w-3 h-3" />;
      case 'stake':
        return <Landmark className="w-3 h-3" />;
      default:
        return <Send className="w-3 h-3" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'transfer':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'swap':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'stake':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const isCurrentMonth = (day: Date) => {
    return day.getMonth() === currentMonth.getMonth();
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, dayIdx) => {
          const dayTransactions = getTransactionsForDay(day);
          const isInMonth = isCurrentMonth(day);

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDateClick(day)}
              className={`
                min-h-[100px] p-2 border-b border-r border-gray-100 cursor-pointer transition-colors
                ${!isInMonth ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}
                ${dayIdx % 7 === 0 ? 'border-l-0' : ''}
              `}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`
                    inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full
                    ${isToday(day)
                      ? 'bg-purple-600 text-white'
                      : isInMonth
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }
                  `}
                >
                  {format(day, 'd')}
                </span>
                {isInMonth && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDateClick(day);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all"
                  >
                    <Plus className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>

              {/* Transaction indicators */}
              <div className="space-y-1">
                {dayTransactions.slice(0, 2).map((tx) => (
                  <button
                    key={tx.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTransactionClick?.(tx);
                    }}
                    className={`
                      w-full text-left text-xs px-2 py-1 rounded border flex items-center gap-1 truncate
                      ${getTypeColor(tx.transaction_type)}
                      hover:opacity-80 transition-opacity
                    `}
                  >
                    {getTypeIcon(tx.transaction_type)}
                    <span className="truncate font-medium">
                      {tx.amount} {getTokenSymbol(tx.token_mint)}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0 ${getStatusColor(tx.status)}`}
                    />
                  </button>
                ))}
                {dayTransactions.length > 2 && (
                  <div className="text-xs text-gray-500 pl-2">
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
