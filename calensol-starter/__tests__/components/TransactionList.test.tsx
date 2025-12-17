import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionList } from '@/components/TransactionList';
import type { ScheduledTransaction } from '@/types';

describe('TransactionList', () => {
  const mockOnDelete = jest.fn();
  const mockOnCancel = jest.fn();

  const createMockTransaction = (overrides: Partial<ScheduledTransaction> = {}): ScheduledTransaction => ({
    id: 'tx-1',
    user_id: 'user-1',
    transaction_type: 'transfer',
    scheduled_at: '2024-12-25T15:00:00Z',
    amount: 100,
    token_mint: null,
    to_pubkey: 'ABC123...XYZ',
    status: 'pending',
    from_pubkey: 'sender-1',
    nonce_account_id: null,
    google_event_id: null,
    google_calendar_id: 'primary',
    recurrence_rule: null,
    next_execution_at: null,
    max_executions: null,
    execution_count: 0,
    input_mint: null,
    output_mint: null,
    slippage_bps: 100,
    min_output_amount: null,
    presigned_tx_base64: null,
    signature: null,
    error_message: null,
    retry_count: 0,
    max_retries: 3,
    executed_at: null,
    memo: null,
    tags: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('empty state', () => {
    it('should show empty state message', () => {
      render(
        <TransactionList
          transactions={[]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('No scheduled transactions')).toBeInTheDocument();
      expect(
        screen.getByText('Click on a date in the calendar to schedule your first transaction.')
      ).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading indicator', () => {
      render(
        <TransactionList
          transactions={[]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
          isLoading={true}
        />
      );

      expect(screen.getByText('Loading transactions...')).toBeInTheDocument();
    });
  });

  describe('transaction display', () => {
    it('should display transaction amount and token', () => {
      const transaction = createMockTransaction({ amount: 100 });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('100 SOL')).toBeInTheDocument();
    });

    it('should display USDC for USDC token mint', () => {
      const transaction = createMockTransaction({
        token_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('100 USDC')).toBeInTheDocument();
    });

    it('should display recipient for transfer', () => {
      const transaction = createMockTransaction({
        to_pubkey: 'ABCD1234EFGH5678IJKL',
      });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('To: ABCD...IJKL')).toBeInTheDocument();
    });

    it('should display scheduled date and time', () => {
      const transaction = createMockTransaction({
        scheduled_at: '2024-12-25T15:00:00Z',
      });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      // The formatted date should be displayed
      expect(screen.getByText(/Dec 25, 2024/)).toBeInTheDocument();
    });

    it('should display recurrence rule', () => {
      const transaction = createMockTransaction({
        recurrence_rule: 'FREQ=WEEKLY',
      });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Recurring: WEEKLY')).toBeInTheDocument();
    });

    it('should display memo', () => {
      const transaction = createMockTransaction({
        memo: 'Monthly payment',
      });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('"Monthly payment"')).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    it('should show Pending status', () => {
      const transaction = createMockTransaction({ status: 'pending' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should show Completed status', () => {
      const transaction = createMockTransaction({ status: 'completed' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should show Failed status with error message', () => {
      const transaction = createMockTransaction({
        status: 'failed',
        error_message: 'Insufficient funds',
      });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Error: Insufficient funds')).toBeInTheDocument();
    });

    it('should show Executing status', () => {
      const transaction = createMockTransaction({ status: 'executing' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Executing')).toBeInTheDocument();
    });
  });

  describe('explorer link', () => {
    it('should show explorer link for completed transactions', () => {
      const transaction = createMockTransaction({
        status: 'completed',
        signature: 'abc123signature456',
      });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      const link = screen.getByText('View on Explorer');
      expect(link).toHaveAttribute(
        'href',
        'https://explorer.solana.com/tx/abc123signature456?cluster=devnet'
      );
    });

    it('should not show explorer link without signature', () => {
      const transaction = createMockTransaction({
        status: 'completed',
        signature: null,
      });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.queryByText('View on Explorer')).not.toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('should show action menu for pending transactions', async () => {
      const transaction = createMockTransaction({ status: 'pending' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      // Click the menu button (MoreVertical)
      const menuButtons = screen.getAllByRole('button');
      const menuButton = menuButtons[menuButtons.length - 1];
      await userEvent.click(menuButton);

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should call onCancel when Cancel is clicked', async () => {
      const transaction = createMockTransaction({ status: 'pending', id: 'tx-test' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      const menuButton = screen.getAllByRole('button').pop()!;
      await userEvent.click(menuButton);
      await userEvent.click(screen.getByText('Cancel'));

      expect(mockOnCancel).toHaveBeenCalledWith('tx-test');
    });

    it('should call onDelete when Delete is clicked', async () => {
      const transaction = createMockTransaction({ status: 'pending', id: 'tx-test' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      const menuButton = screen.getAllByRole('button').pop()!;
      await userEvent.click(menuButton);
      await userEvent.click(screen.getByText('Delete'));

      expect(mockOnDelete).toHaveBeenCalledWith('tx-test');
    });

    it('should not show action menu for completed transactions', () => {
      const transaction = createMockTransaction({ status: 'completed' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      // Only the link should be present, no menu button
      expect(screen.queryByTitle('More options')).not.toBeInTheDocument();
    });

    it('should show action menu for failed transactions', async () => {
      const transaction = createMockTransaction({ status: 'failed' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      const menuButton = screen.getAllByRole('button').pop()!;
      await userEvent.click(menuButton);

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  describe('transaction types', () => {
    it('should display transfer type correctly', () => {
      const transaction = createMockTransaction({ transaction_type: 'transfer' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      // Should have blue styling for transfer
      const typeIcon = document.querySelector('.bg-blue-100');
      expect(typeIcon).toBeInTheDocument();
    });

    it('should display swap type correctly', () => {
      const transaction = createMockTransaction({ transaction_type: 'swap' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      // Should have green styling for swap
      const typeIcon = document.querySelector('.bg-green-100');
      expect(typeIcon).toBeInTheDocument();
    });

    it('should display stake type correctly', () => {
      const transaction = createMockTransaction({ transaction_type: 'stake' });

      render(
        <TransactionList
          transactions={[transaction]}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      // Should have purple styling for stake
      const typeIcon = document.querySelector('.bg-purple-100');
      expect(typeIcon).toBeInTheDocument();
    });
  });

  describe('multiple transactions', () => {
    it('should display multiple transactions', () => {
      const transactions = [
        createMockTransaction({ id: 'tx-1', amount: 100 }),
        createMockTransaction({ id: 'tx-2', amount: 200 }),
        createMockTransaction({ id: 'tx-3', amount: 300 }),
      ];

      render(
        <TransactionList
          transactions={transactions}
          onDelete={mockOnDelete}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('100 SOL')).toBeInTheDocument();
      expect(screen.getByText('200 SOL')).toBeInTheDocument();
      expect(screen.getByText('300 SOL')).toBeInTheDocument();
    });
  });
});
