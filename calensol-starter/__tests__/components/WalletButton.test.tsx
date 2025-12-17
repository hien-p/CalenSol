import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletButton } from '@/components/WalletButton';

// Mock useCalenSolWallet hook
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@/hooks/useCalenSolWallet', () => ({
  useCalenSolWallet: () => ({
    walletAddress: null,
    isConnected: false,
    isLoading: false,
    connect: mockConnect,
    disconnect: mockDisconnect,
    error: null,
  }),
}));

describe('WalletButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('disconnected state', () => {
    it('should render connect button when not connected', () => {
      render(<WalletButton />);

      expect(screen.getByText('Connect with Passkey')).toBeInTheDocument();
    });

    it('should call connect on button click', async () => {
      render(<WalletButton />);

      await userEvent.click(screen.getByText('Connect with Passkey'));

      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    beforeEach(() => {
      jest.spyOn(require('@/hooks/useCalenSolWallet'), 'useCalenSolWallet').mockReturnValue({
        walletAddress: null,
        isConnected: false,
        isLoading: true,
        connect: mockConnect,
        disconnect: mockDisconnect,
        error: null,
      });
    });

    it('should show loading state', () => {
      render(<WalletButton />);

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('should disable button when loading', () => {
      render(<WalletButton />);

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('connected state', () => {
    beforeEach(() => {
      jest.spyOn(require('@/hooks/useCalenSolWallet'), 'useCalenSolWallet').mockReturnValue({
        walletAddress: 'ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU',
        isConnected: true,
        isLoading: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        error: null,
      });
    });

    it('should show truncated wallet address', () => {
      render(<WalletButton />);

      expect(screen.getByText('ABC1...STU')).toBeInTheDocument();
    });

    it('should call disconnect on button click', async () => {
      render(<WalletButton />);

      const disconnectButton = screen.getByTitle('Disconnect');
      await userEvent.click(disconnectButton);

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should have copy address functionality', async () => {
      render(<WalletButton />);

      const copyButton = screen.getByTitle('Copy address');
      await userEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'ABC123XYZ789DEF456GHI012JKL345MNO678PQR901STU'
      );
    });
  });

  describe('error state', () => {
    beforeEach(() => {
      jest.spyOn(require('@/hooks/useCalenSolWallet'), 'useCalenSolWallet').mockReturnValue({
        walletAddress: null,
        isConnected: false,
        isLoading: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        error: 'Connection failed',
      });
    });

    it('should display error message', () => {
      render(<WalletButton />);

      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });
});
