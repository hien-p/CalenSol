'use client';

import { useCalenSolWallet } from '@/hooks/useCalenSolWallet';
import { Fingerprint, Wallet, LogOut, Loader2, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export function WalletButton() {
  const {
    walletAddress,
    isConnected,
    isLoading,
    connect,
    disconnect,
    error,
  } = useCalenSolWallet();
  const [copied, setCopied] = useState(false);

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  const copyAddress = async () => {
    if (walletAddress) {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-500 rounded-xl font-medium"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Connecting...
      </button>
    );
  }

  if (isConnected && walletAddress) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl">
          <Wallet className="w-4 h-4" />
          <span className="font-mono text-sm font-medium">
            {truncateAddress(walletAddress)}
          </span>
          <button
            onClick={copyAddress}
            className="p-1 hover:bg-green-100 rounded transition-colors"
            title="Copy address"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <button
          onClick={disconnect}
          className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          title="Disconnect"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/25"
      >
        <Fingerprint className="w-5 h-5" />
        Connect with Passkey
      </button>
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
