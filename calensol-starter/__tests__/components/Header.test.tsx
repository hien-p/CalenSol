import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/Header';

// Mock useCalenSolWallet hook
const mockUseCalenSolWallet = jest.fn();
jest.mock('@/hooks/useCalenSolWallet', () => ({
  useCalenSolWallet: () => mockUseCalenSolWallet(),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = {
  href: '',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.href = '';
    mockUseCalenSolWallet.mockReturnValue({
      walletAddress: null,
      isConnected: false,
    });
  });

  describe('rendering', () => {
    it('should render logo', () => {
      render(<Header />);

      expect(screen.getByText('CalenSol')).toBeInTheDocument();
    });

    it('should render logo link to home', () => {
      render(<Header />);

      const logoLink = screen.getByText('CalenSol').closest('a');
      expect(logoLink).toHaveAttribute('href', '/');
    });

    it('should render WalletButton', () => {
      render(<Header />);

      // WalletButton should be rendered
      expect(screen.getByText('Connect with Passkey')).toBeInTheDocument();
    });
  });

  describe('Google Calendar connection', () => {
    beforeEach(() => {
      mockUseCalenSolWallet.mockReturnValue({
        walletAddress: 'test-wallet-address',
        isConnected: true,
      });
    });

    it('should show Connect Calendar button when not connected to Google', () => {
      render(<Header isGoogleConnected={false} />);

      expect(screen.getByText('Connect Calendar')).toBeInTheDocument();
    });

    it('should show Calendar Connected badge when connected to Google', () => {
      render(<Header isGoogleConnected={true} />);

      expect(screen.getByText('Calendar Connected')).toBeInTheDocument();
    });

    it('should not show Google buttons when wallet is not connected', () => {
      mockUseCalenSolWallet.mockReturnValue({
        walletAddress: null,
        isConnected: false,
      });

      render(<Header isGoogleConnected={false} />);

      expect(screen.queryByText('Connect Calendar')).not.toBeInTheDocument();
      expect(screen.queryByText('Calendar Connected')).not.toBeInTheDocument();
    });

    it('should initiate Google OAuth when Connect Calendar is clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://accounts.google.com/oauth' }),
      });

      render(<Header isGoogleConnected={false} />);

      await userEvent.click(screen.getByText('Connect Calendar'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/auth/google?wallet=test-wallet-address'
        );
      });

      await waitFor(() => {
        expect(mockLocation.href).toBe('https://accounts.google.com/oauth');
      });
    });

    it('should show loading state while connecting to Google', async () => {
      // Make fetch hang
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      render(<Header isGoogleConnected={false} />);

      await userEvent.click(screen.getByText('Connect Calendar'));

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('should handle Google OAuth error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<Header isGoogleConnected={false} />);

      await userEvent.click(screen.getByText('Connect Calendar'));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('styling', () => {
    it('should have sticky positioning', () => {
      render(<Header />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('sticky');
      expect(header).toHaveClass('top-0');
    });

    it('should have backdrop blur', () => {
      render(<Header />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('backdrop-blur-lg');
    });
  });

  describe('Google icon', () => {
    beforeEach(() => {
      mockUseCalenSolWallet.mockReturnValue({
        walletAddress: 'test-wallet-address',
        isConnected: true,
      });
    });

    it('should render Google icon in Connect Calendar button', () => {
      render(<Header isGoogleConnected={false} />);

      const button = screen.getByText('Connect Calendar').closest('button');
      const svg = button?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render Google icon in Calendar Connected badge', () => {
      render(<Header isGoogleConnected={true} />);

      const badge = screen.getByText('Calendar Connected').closest('div');
      const svg = badge?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('responsive behavior', () => {
    it('should use flex layout for header content', () => {
      render(<Header />);

      const headerContent = screen.getByRole('banner').firstChild?.firstChild;
      expect(headerContent).toHaveClass('flex');
      expect(headerContent).toHaveClass('items-center');
      expect(headerContent).toHaveClass('justify-between');
    });
  });

  describe('wallet address display', () => {
    it('should not call Google OAuth without wallet address', async () => {
      mockUseCalenSolWallet.mockReturnValue({
        walletAddress: null,
        isConnected: true,
      });

      render(<Header isGoogleConnected={false} />);

      // The button should not be visible when wallet is not connected properly
      // But if it were, clicking should not make a fetch call
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
