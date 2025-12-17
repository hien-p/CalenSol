import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTransactionModal } from '@/components/CreateTransactionModal';
import { format, addDays } from 'date-fns';

// Mock useCalenSolWallet hook
jest.mock('@/hooks/useCalenSolWallet', () => ({
  useCalenSolWallet: () => ({
    walletAddress: 'test-wallet-address',
    isConnected: true,
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CreateTransactionModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();
  const futureDate = addDays(new Date(), 1);

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <CreateTransactionModal
          isOpen={false}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.queryByText('Schedule Transaction')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByText('Schedule Transaction')).toBeInTheDocument();
    });

    it('should render all transaction type buttons', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByText('Transfer')).toBeInTheDocument();
      expect(screen.getByText('Swap')).toBeInTheDocument();
      expect(screen.getByText('Stake')).toBeInTheDocument();
    });

    it('should render amount and token inputs', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByLabelText('Amount')).toBeInTheDocument();
      expect(screen.getByLabelText('Token')).toBeInTheDocument();
    });

    it('should render date and time inputs', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByLabelText(/Date/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Time/)).toBeInTheDocument();
    });

    it('should pre-fill date from selectedDate prop', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          selectedDate={futureDate}
        />
      );

      const dateInput = screen.getByLabelText(/Date/) as HTMLInputElement;
      expect(dateInput.value).toBe(format(futureDate, 'yyyy-MM-dd'));
    });
  });

  describe('transaction type selection', () => {
    it('should show recipient field for transfer type', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByLabelText('Recipient Address')).toBeInTheDocument();
    });

    it('should hide recipient field for swap type', async () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      await userEvent.click(screen.getByText('Swap'));

      expect(screen.queryByLabelText('Recipient Address')).not.toBeInTheDocument();
    });

    it('should hide recipient field for stake type', async () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      await userEvent.click(screen.getByText('Stake'));

      expect(screen.queryByLabelText('Recipient Address')).not.toBeInTheDocument();
    });
  });

  describe('recurring transaction', () => {
    it('should show recurrence options when recurring is checked', async () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      await userEvent.click(screen.getByText('Make this a recurring transaction'));

      expect(screen.getByLabelText('Repeat')).toBeInTheDocument();
    });

    it('should have recurrence options', async () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      await userEvent.click(screen.getByText('Make this a recurring transaction'));

      const select = screen.getByLabelText('Repeat');
      expect(select).toContainHTML('Daily');
      expect(select).toContainHTML('Weekly');
      expect(select).toContainHTML('Monthly');
    });
  });

  describe('form submission', () => {
    it('should submit form with correct data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: { id: 'new-tx' } }),
      });

      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          selectedDate={futureDate}
        />
      );

      await userEvent.type(screen.getByLabelText('Amount'), '100');
      await userEvent.type(
        screen.getByLabelText('Recipient Address'),
        'recipient-wallet-address'
      );
      await userEvent.type(screen.getByLabelText(/Time/), '15:00');

      await userEvent.click(screen.getByText('Schedule Transaction'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        });
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.walletAddress).toBe('test-wallet-address');
      expect(callBody.type).toBe('transfer');
      expect(callBody.amount).toBe(100);
      expect(callBody.recipient).toBe('recipient-wallet-address');
    });

    it('should call onSuccess and onClose on successful submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: { id: 'new-tx' } }),
      });

      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          selectedDate={futureDate}
        />
      );

      await userEvent.type(screen.getByLabelText('Amount'), '100');
      await userEvent.type(
        screen.getByLabelText('Recipient Address'),
        'recipient-wallet-address'
      );
      await userEvent.type(screen.getByLabelText(/Time/), '15:00');

      await userEvent.click(screen.getByText('Schedule Transaction'));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should show error message on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to create transaction' }),
      });

      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          selectedDate={futureDate}
        />
      );

      await userEvent.type(screen.getByLabelText('Amount'), '100');
      await userEvent.type(
        screen.getByLabelText('Recipient Address'),
        'recipient-wallet-address'
      );
      await userEvent.type(screen.getByLabelText(/Time/), '15:00');

      await userEvent.click(screen.getByText('Schedule Transaction'));

      await waitFor(() => {
        expect(screen.getByText('Failed to create transaction')).toBeInTheDocument();
      });
    });

    it('should show error for past scheduled time', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      await userEvent.type(screen.getByLabelText('Amount'), '100');
      await userEvent.type(
        screen.getByLabelText('Recipient Address'),
        'recipient-wallet-address'
      );

      // Submit with past date
      const dateInput = screen.getByLabelText(/Date/) as HTMLInputElement;
      fireEvent.change(dateInput, {
        target: { value: format(pastDate, 'yyyy-MM-dd') },
      });
      await userEvent.type(screen.getByLabelText(/Time/), '12:00');

      await userEvent.click(screen.getByText('Schedule Transaction'));

      await waitFor(() => {
        expect(
          screen.getByText('Scheduled time must be in the future')
        ).toBeInTheDocument();
      });
    });
  });

  describe('close functionality', () => {
    it('should call onClose when X button is clicked', async () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find(
        (btn) => btn.querySelector('svg.lucide-x')
      );

      if (closeButton) {
        await userEvent.click(closeButton);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('memo field', () => {
    it('should render memo input', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByLabelText('Memo (optional)')).toBeInTheDocument();
    });

    it('should include memo in submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: { id: 'new-tx' } }),
      });

      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          selectedDate={futureDate}
        />
      );

      await userEvent.type(screen.getByLabelText('Amount'), '100');
      await userEvent.type(
        screen.getByLabelText('Recipient Address'),
        'recipient-wallet-address'
      );
      await userEvent.type(screen.getByLabelText(/Time/), '15:00');
      await userEvent.type(screen.getByLabelText('Memo (optional)'), 'Test memo');

      await userEvent.click(screen.getByText('Schedule Transaction'));

      await waitFor(() => {
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.memo).toBe('Test memo');
      });
    });
  });

  describe('wallet not connected', () => {
    beforeEach(() => {
      jest.spyOn(require('@/hooks/useCalenSolWallet'), 'useCalenSolWallet').mockReturnValue({
        walletAddress: null,
        isConnected: false,
      });
    });

    it('should show connect wallet message', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(
        screen.getByText('Please connect your wallet to schedule transactions')
      ).toBeInTheDocument();
    });

    it('should disable submit button', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      expect(screen.getByText('Schedule Transaction').closest('button')).toBeDisabled();
    });
  });

  describe('token selection', () => {
    it('should have SOL and USDC options', () => {
      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      );

      const tokenSelect = screen.getByLabelText('Token');
      expect(tokenSelect).toContainHTML('SOL');
      expect(tokenSelect).toContainHTML('USDC');
    });

    it('should submit with correct token mint for USDC', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transaction: { id: 'new-tx' } }),
      });

      render(
        <CreateTransactionModal
          isOpen={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          selectedDate={futureDate}
        />
      );

      await userEvent.selectOptions(screen.getByLabelText('Token'), 'USDC');
      await userEvent.type(screen.getByLabelText('Amount'), '100');
      await userEvent.type(
        screen.getByLabelText('Recipient Address'),
        'recipient-wallet-address'
      );
      await userEvent.type(screen.getByLabelText(/Time/), '15:00');

      await userEvent.click(screen.getByText('Schedule Transaction'));

      await waitFor(() => {
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.tokenMint).toBeTruthy(); // USDC mint address
      });
    });
  });
});
