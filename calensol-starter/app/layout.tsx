import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { CalenSolProvider } from '@/providers/CalenSolProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CalenSol - Calendar-Native Solana Wallet',
  description: 'Schedule blockchain transactions like calendar events. Powered by LazorKit passkey authentication and gasless transactions.',
  keywords: ['Solana', 'Wallet', 'Calendar', 'Crypto', 'DeFi', 'LazorKit', 'Passkey'],
  authors: [{ name: 'CalenSol' }],
  openGraph: {
    title: 'CalenSol - Calendar-Native Solana Wallet',
    description: 'Schedule blockchain transactions like calendar events',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CalenSolProvider>
          {children}
        </CalenSolProvider>
      </body>
    </html>
  );
}
