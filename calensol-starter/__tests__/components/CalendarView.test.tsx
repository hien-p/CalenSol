import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarView } from '@/components/CalendarView';
import { format, addMonths, subMonths } from 'date-fns';

describe('CalendarView', () => {
  const mockOnDateClick = jest.fn();
  const mockOnTransactionClick = jest.fn();

  const mockTransactions = [
    {
      id: 'tx-1',
      user_id: 'user-1',
      transaction_type: 'transfer' as const,
      scheduled_at: new Date().toISOString(),
      amount: 100,
      token_mint: null,
      to_pubkey: 'recipient-1',
      status: 'pending' as const,
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
    },
    {
      id: 'tx-2',
      user_id: 'user-1',
      transaction_type: 'swap' as const,
      scheduled_at: new Date().toISOString(),
      amount: 50,
      token_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      to_pubkey: null,
      status: 'completed' as const,
      from_pubkey: 'sender-1',
      nonce_account_id: null,
      google_event_id: null,
      google_calendar_id: 'primary',
      recurrence_rule: null,
      next_execution_at: null,
      max_executions: null,
      execution_count: 1,
      input_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      output_mint: 'So11111111111111111111111111111111111111112',
      slippage_bps: 100,
      min_output_amount: null,
      presigned_tx_base64: null,
      signature: 'tx-sig-123',
      error_message: null,
      retry_count: 0,
      max_retries: 3,
      executed_at: new Date().toISOString(),
      memo: null,
      tags: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render current month and year', () => {
      render(
        <CalendarView
          transactions={[]}
          onDateClick={mockOnDateClick}
        />
      );

      expect(screen.getByText(format(new Date(), 'MMMM yyyy'))).toBeInTheDocument();
    });

    it('should render day headers', () => {
      render(
        <CalendarView
          transactions={[]}
          onDateClick={mockOnDateClick}
        />
      );

      expect(screen.getByText('Sun')).toBeInTheDocument();
      expect(screen.getByText('Mon')).toBeInTheDocument();
      expect(screen.getByText('Tue')).toBeInTheDocument();
      expect(screen.getByText('Wed')).toBeInTheDocument();
      expect(screen.getByText('Thu')).toBeInTheDocument();
      expect(screen.getByText('Fri')).toBeInTheDocument();
      expect(screen.getByText('Sat')).toBeInTheDocument();
    });

    it('should render Today button', () => {
      render(
        <CalendarView
          transactions={[]}
          onDateClick={mockOnDateClick}
        />
      );

      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('should highlight today', () => {
      render(
        <CalendarView
          transactions={[]}
          onDateClick={mockOnDateClick}
        />
      );

      const today = format(new Date(), 'd');
      const todayElement = screen.getByText(today);

      // The parent should have styling for today
      expect(todayElement.parentElement?.parentElement).toHaveClass('bg-white');
    });
  });

  describe('navigation', () => {
    it('should navigate to previous month', async () => {
      render(
        <CalendarView
          transactions={[]}
          onDateClick={mockOnDateClick}
        />
      );

      const prevButton = screen.getAllByRole('button')[0];
      await userEvent.click(prevButton);

      const prevMonth = subMonths(new Date(), 1);
      expect(screen.getByText(format(prevMonth, 'MMMM yyyy'))).toBeInTheDocument();
    });

    it('should navigate to next month', async () => {
      render(
        <CalendarView
          transactions={[]}
          onDateClick={mockOnDateClick}
        />
      );

      const nextButton = screen.getAllByRole('button')[2];
      await userEvent.click(nextButton);

      const nextMonth = addMonths(new Date(), 1);
      expect(screen.getByText(format(nextMonth, 'MMMM yyyy'))).toBeInTheDocument();
    });

    it('should return to current month when Today is clicked', async () => {
      render(
        <CalendarView
          transactions={[]}
          onDateClick={mockOnDateClick}
        />
      );

      // Navigate away
      const prevButton = screen.getAllByRole('button')[0];
      await userEvent.click(prevButton);
      await userEvent.click(prevButton);

      // Click Today
      await userEvent.click(screen.getByText('Today'));

      expect(screen.getByText(format(new Date(), 'MMMM yyyy'))).toBeInTheDocument();
    });
  });

  describe('transactions display', () => {
    it('should display transactions on their scheduled dates', () => {
      render(
        <CalendarView
          transactions={mockTransactions}
          onDateClick={mockOnDateClick}
        />
      );

      expect(screen.getByText('100 SOL')).toBeInTheDocument();
      expect(screen.getByText('50 USDC')).toBeInTheDocument();
    });

    it('should show +N more when more than 2 transactions', () => {
      const manyTransactions = [
        ...mockTransactions,
        { ...mockTransactions[0], id: 'tx-3', amount: 75 },
        { ...mockTransactions[0], id: 'tx-4', amount: 25 },
      ];

      render(
        <CalendarView
          transactions={manyTransactions}
          onDateClick={mockOnDateClick}
        />
      );

      expect(screen.getByText('+2 more')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onDateClick when clicking a date', async () => {
      render(
        <CalendarView
          transactions={[]}
          onDateClick={mockOnDateClick}
        />
      );

      const dayCell = screen.getByText('15').closest('div');
      if (dayCell) {
        await userEvent.click(dayCell);
      }

      expect(mockOnDateClick).toHaveBeenCalled();
    });

    it('should call onTransactionClick when clicking a transaction', async () => {
      render(
        <CalendarView
          transactions={mockTransactions}
          onDateClick={mockOnDateClick}
          onTransactionClick={mockOnTransactionClick}
        />
      );

      await userEvent.click(screen.getByText('100 SOL'));

      expect(mockOnTransactionClick).toHaveBeenCalledWith(mockTransactions[0]);
    });
  });

  describe('status indicators', () => {
    it('should show correct status colors', () => {
      const transactionsWithStatuses = [
        { ...mockTransactions[0], status: 'pending' as const },
        { ...mockTransactions[1], status: 'completed' as const },
      ];

      render(
        <CalendarView
          transactions={transactionsWithStatuses}
          onDateClick={mockOnDateClick}
        />
      );

      // Status dots should be present
      const statusDots = document.querySelectorAll('.rounded-full');
      expect(statusDots.length).toBeGreaterThan(0);
    });
  });

  describe('token symbols', () => {
    it('should display SOL for null token mint', () => {
      render(
        <CalendarView
          transactions={[mockTransactions[0]]}
          onDateClick={mockOnDateClick}
        />
      );

      expect(screen.getByText('100 SOL')).toBeInTheDocument();
    });

    it('should display USDC for USDC mint', () => {
      render(
        <CalendarView
          transactions={[mockTransactions[1]]}
          onDateClick={mockOnDateClick}
        />
      );

      expect(screen.getByText('50 USDC')).toBeInTheDocument();
    });
  });
});
