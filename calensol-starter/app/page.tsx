'use client';

import Link from 'next/link';
import {
  Calendar,
  Fingerprint,
  Zap,
  Clock,
  RefreshCw,
  Shield,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                CalenSol
              </span>
            </div>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              Launch App
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Powered by LazorKit on Solana
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Schedule Blockchain
            <br />
            <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Transactions Like Calendar Events
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            CalenSol transforms Google Calendar into a Solana transaction scheduler.
            Create events like "Send 100 USDC at 3PM Friday" and watch them execute
            automatically.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/25"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://github.com/example/calensol"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              The Future of Scheduled Transactions
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Combine the familiar UX of Google Calendar with the power of Solana
              blockchain for seamless scheduled payments.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <Fingerprint className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Passkey Authentication
              </h3>
              <p className="text-gray-600">
                No more seed phrases. Connect using Face ID or Touch ID with
                LazorKit's secure passkey wallet.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Gasless Transactions
              </h3>
              <p className="text-gray-600">
                Execute transactions without worrying about gas fees. LazorKit's
                paymaster handles it all.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Google Calendar Native
              </h3>
              <p className="text-gray-600">
                Schedule transactions right from your calendar. Get reminders and
                track execution status in real-time.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Durable Transactions
              </h3>
              <p className="text-gray-600">
                Using Solana's durable nonces, your scheduled transactions never
                expire until execution.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                <RefreshCw className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Recurring Payments
              </h3>
              <p className="text-gray-600">
                Set up daily, weekly, or monthly recurring transactions. Perfect for
                subscriptions and DCA strategies.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Secure by Design
              </h3>
              <p className="text-gray-600">
                Pre-signed transactions with your approval. No private keys stored.
                You're always in control.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-lg text-gray-600">
              Three simple steps to schedule your first transaction
            </p>
          </div>

          <div className="space-y-8">
            {/* Step 1 */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Connect Your Wallet
                </h3>
                <p className="text-gray-600">
                  Use Face ID or Touch ID to create or connect your passkey wallet.
                  Then link your Google Calendar for scheduling.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Schedule a Transaction
                </h3>
                <p className="text-gray-600">
                  Click any date on the calendar, enter transaction details (amount,
                  recipient, token), and confirm with your passkey.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Watch It Execute
                </h3>
                <p className="text-gray-600">
                  At the scheduled time, your transaction executes automatically. Get
                  notifications and see the updated status in your calendar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Use Cases</h2>
            <p className="text-lg text-gray-600">
              Perfect for any scheduled blockchain operation
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900">Scheduled Payments</h4>
                <p className="text-gray-600 text-sm">
                  Pay contractors, rent, or subscriptions at specific times
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900">Dollar Cost Averaging</h4>
                <p className="text-gray-600 text-sm">
                  Automatically buy tokens on a recurring schedule
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900">Payroll</h4>
                <p className="text-gray-600 text-sm">
                  Schedule weekly or monthly payroll for your team
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900">Token Unlocks</h4>
                <p className="text-gray-600 text-sm">
                  Schedule vesting distributions at predetermined dates
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to Schedule Your First Transaction?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Join the future of automated blockchain payments with CalenSol.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/25 text-lg"
          >
            Launch App
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">CalenSol</span>
          </div>
          <p className="text-gray-500 text-sm">
            Built with LazorKit SDK for the Solana ecosystem
          </p>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <a href="#" className="hover:text-gray-900">
              Docs
            </a>
            <a href="#" className="hover:text-gray-900">
              GitHub
            </a>
            <a href="#" className="hover:text-gray-900">
              Twitter
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
