'use client';

import { LazorkitProvider } from '@lazorkit/wallet';
import { ReactNode, useEffect, useState } from 'react';

// Polyfills for browser environment
if (typeof window !== 'undefined') {
  const { Buffer } = require('buffer');
  window.Buffer = Buffer;
}

interface Props {
  children: ReactNode;
}

export function CalenSolProvider({ children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  return (
    <LazorkitProvider
      rpcUrl={process.env.NEXT_PUBLIC_LAZORKIT_RPC_URL || 'https://api.devnet.solana.com'}
      ipfsUrl={process.env.NEXT_PUBLIC_LAZORKIT_PORTAL_URL || 'https://portal.lazor.sh'}
      paymasterUrl={process.env.NEXT_PUBLIC_LAZORKIT_PAYMASTER_URL || 'https://lazorkit-paymaster.onrender.com'}
    >
      {children}
    </LazorkitProvider>
  );
}
