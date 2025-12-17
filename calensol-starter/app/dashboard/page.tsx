'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { CalendarView } from '@/components/CalendarView';
import { TransactionList } from '@/components/TransactionList';
import { CreateTransactionModal } from '@/components/CreateTransactionModal';
import { useCalenSolWallet } from '@/hooks/useCalenSolWallet';
import { useTransactions } from '@/hooks/useTransactions';
import { Plus, Calendar, Wallet, Clock, CheckCircle2 } from 'lucide-react';
import type { ScheduledTransaction } from '@/types';

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const { walletAddress, isConnected } = useCalenSolWallet();
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const {
    transactions,
    isLoading,
    refresh,
    deleteTransaction,
    cancelTransaction,
  } = useTransactions({
    walletAddress,
    autoRefresh: true,
    refreshInterval: 30000,
  });

  // Check for URL params (Google OAuth callback)
  useEffect(() => {
    const googleStatus = searchParams.get('google');
    const error = searchParams.get('error');

    if (googleStatus === 'connected') {
      setIsGoogleConnected(true);
      setNotification('Google Calendar connected successfully!');
      // Clear params from URL
      window.history.replaceState({}, '', '/dashboard');
    }

    if (error) {
      setNotification(`Error: ${decodeURIComponent(error)}`);
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  // Clear notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Check if Google is connected when wallet connects
  useEffect(() => {
    async function checkGoogleConnection() {
      if (!walletAddress) {
        setIsGoogleConnected(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/calendar/events?wallet=${walletAddress}&maxResults=1`
        );
        setIsGoogleConnected(response.ok);
      } catch {
        setIsGoogleConnected(false);
      }
    }

    checkGoogleConnection();
  }, [walletAddress]);

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const handleTransactionClick = (transaction: ScheduledTransaction) => {
    // Could open a detail modal here
    console.log('Transaction clicked:', transaction);
  };

  const handleModalSuccess = () => {
    refresh();
    setNotification('Transaction scheduled successfully!');
  };

  const handleDelete = async (id: string) => {
    const success = await deleteTransaction(id);
    if (success) {
      setNotification('Transaction deleted');
    }
  };

  const handleCancel = async (id: string) => {
    const success = await cancelTransaction(id);
    if (success) {
      setNotification('Transaction cancelled');
    }
  };

  // Stats
  const pendingCount = transactions.filter((tx) => tx.status === 'pending').length;
  const completedCount = transactions.filter((tx) => tx.status === 'completed').length;
  const totalVolume = transactions
    .filter((tx) => tx.status === 'completed')
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header isGoogleConnected={isGoogleConnected} />

      {/* Notification Banner */}
      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-900 text-white rounded-lg shadow-lg animate-in slide-in-from-top">
          {notification}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isConnected ? (
          /* Not Connected State */
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-2xl flex items-center justify-center mb-6">
              <Wallet className="w-10 h-10 text-purple-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Connect Your Wallet
            </h1>
            <p className="text-gray-500 max-w-md mb-6">
              Connect your wallet using passkey authentication to start scheduling
              Solana transactions like calendar events.
            </p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
                    <p className="text-sm text-gray-500">Pending</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
                    <p className="text-sm text-gray-500">Completed</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Calendar className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {transactions.length}
                    </p>
                    <p className="text-sm text-gray-500">Total</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <svg
                      className="w-5 h-5 text-yellow-600"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {totalVolume.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">Volume</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Calendar View */}
              <div className="lg:col-span-2">
                <CalendarView
                  transactions={transactions}
                  onDateClick={handleDateClick}
                  onTransactionClick={handleTransactionClick}
                />
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Quick Actions */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Quick Actions
                  </h3>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity"
                  >
                    <Plus className="w-5 h-5" />
                    New Transaction
                  </button>
                </div>

                {/* Transaction List */}
                <TransactionList
                  transactions={transactions.slice(0, 5)}
                  onDelete={handleDelete}
                  onCancel={handleCancel}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Create Transaction Modal */}
      <CreateTransactionModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedDate(undefined);
        }}
        selectedDate={selectedDate}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
