import { renderHook, act } from '@testing-library/react';
import { useCalenSolWallet } from '@/hooks/useCalenSolWallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Mock @lazorkit/wallet
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockSignTransaction = jest.fn();
const mockSignAndSendTransaction = jest.fn();

jest.mock('@lazorkit/wallet', () => ({
  useWallet: () => ({
    smartWalletPubkey: new PublicKey('11111111111111111111111111111111'),
    isConnected: true,
    isLoading: false,
    isConnecting: false,
    isSigning: false,
    error: null,
    account: { smartWallet: '11111111111111111111111111111111' },
    connect: mockConnect,
    disconnect: mockDisconnect,
    signTransaction: mockSignTransaction,
    signAndSendTransaction: mockSignAndSendTransaction,
  }),
}));

// Mock @solana/web3.js Connection
const mockGetBalance = jest.fn();
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getBalance: mockGetBalance,
    })),
  };
});

// Mock @solana/spl-token
jest.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: jest.fn().mockResolvedValue(
    new (jest.requireActual('@solana/web3.js').PublicKey)('22222222222222222222222222222222')
  ),
  createTransferInstruction: jest.fn().mockReturnValue({
    programId: new (jest.requireActual('@solana/web3.js').PublicKey)('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    keys: [],
    data: Buffer.from([]),
  }),
  createAssociatedTokenAccountInstruction: jest.fn().mockReturnValue({
    programId: new (jest.requireActual('@solana/web3.js').PublicKey)('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    keys: [],
    data: Buffer.from([]),
  }),
  getAccount: jest.fn(),
  TOKEN_PROGRAM_ID: new (jest.requireActual('@solana/web3.js').PublicKey)('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
}));

describe('hooks/useCalenSolWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('wallet state', () => {
    it('should return wallet address', () => {
      const { result } = renderHook(() => useCalenSolWallet());

      expect(result.current.walletAddress).toBe('11111111111111111111111111111111');
    });

    it('should return connected state', () => {
      const { result } = renderHook(() => useCalenSolWallet());

      expect(result.current.isConnected).toBe(true);
    });

    it('should return loading state', () => {
      const { result } = renderHook(() => useCalenSolWallet());

      expect(result.current.isLoading).toBe(false);
    });

    it('should return public key', () => {
      const { result } = renderHook(() => useCalenSolWallet());

      expect(result.current.publicKey).toBeInstanceOf(PublicKey);
    });
  });

  describe('connect', () => {
    it('should call connect and return wallet account', async () => {
      const mockWalletAccount = {
        smartWallet: '11111111111111111111111111111111',
      };
      mockConnect.mockResolvedValueOnce(mockWalletAccount);

      const { result } = renderHook(() => useCalenSolWallet());

      let account;
      await act(async () => {
        account = await result.current.connect();
      });

      expect(mockConnect).toHaveBeenCalled();
      expect(account).toEqual(mockWalletAccount);
    });

    it('should throw error on connect failure', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

      const { result } = renderHook(() => useCalenSolWallet());

      await expect(result.current.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should call disconnect', () => {
      const { result } = renderHook(() => useCalenSolWallet());

      result.current.disconnect();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  describe('getSolBalance', () => {
    it('should return SOL balance', async () => {
      mockGetBalance.mockResolvedValueOnce(5 * LAMPORTS_PER_SOL);

      const { result } = renderHook(() => useCalenSolWallet());

      let balance;
      await act(async () => {
        balance = await result.current.getSolBalance();
      });

      expect(balance).toBe(5);
    });

    it('should return 0 on error', async () => {
      mockGetBalance.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useCalenSolWallet());

      let balance;
      await act(async () => {
        balance = await result.current.getSolBalance();
      });

      expect(balance).toBe(0);
    });
  });

  describe('createSolTransferInstruction', () => {
    it('should create SOL transfer instruction', () => {
      const { result } = renderHook(() => useCalenSolWallet());

      const instruction = result.current.createSolTransferInstruction(
        '22222222222222222222222222222222',
        1000000
      );

      expect(instruction).toHaveProperty('programId');
      expect(instruction).toHaveProperty('keys');
      expect(instruction).toHaveProperty('data');
    });
  });

  describe('createTokenTransferInstruction', () => {
    it('should create token transfer instructions', async () => {
      const { getAccount } = require('@solana/spl-token');
      getAccount.mockResolvedValueOnce({}); // ATA exists

      const { result } = renderHook(() => useCalenSolWallet());

      let instructions;
      await act(async () => {
        instructions = await result.current.createTokenTransferInstruction(
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          '22222222222222222222222222222222',
          100,
          6
        );
      });

      expect(instructions).toHaveLength(1); // Only transfer, ATA exists
    });

    it('should include ATA creation if not exists', async () => {
      const { getAccount } = require('@solana/spl-token');
      getAccount.mockRejectedValueOnce(new Error('Account not found'));

      const { result } = renderHook(() => useCalenSolWallet());

      let instructions;
      await act(async () => {
        instructions = await result.current.createTokenTransferInstruction(
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          '22222222222222222222222222222222',
          100,
          6
        );
      });

      expect(instructions).toHaveLength(2); // ATA creation + transfer
    });
  });

  describe('sendSol', () => {
    it('should send SOL and return signature', async () => {
      mockSignAndSendTransaction.mockResolvedValueOnce('tx-signature-123');

      const { result } = renderHook(() => useCalenSolWallet());

      let signature;
      await act(async () => {
        signature = await result.current.sendSol(
          '22222222222222222222222222222222',
          1
        );
      });

      expect(mockSignAndSendTransaction).toHaveBeenCalled();
      expect(signature).toBe('tx-signature-123');
    });
  });

  describe('sendToken', () => {
    it('should send token and return signature', async () => {
      const { getAccount } = require('@solana/spl-token');
      getAccount.mockResolvedValueOnce({});
      mockSignAndSendTransaction.mockResolvedValueOnce('tx-signature-456');

      const { result } = renderHook(() => useCalenSolWallet());

      let signature;
      await act(async () => {
        signature = await result.current.sendToken(
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          '22222222222222222222222222222222',
          100,
          6
        );
      });

      expect(mockSignAndSendTransaction).toHaveBeenCalled();
      expect(signature).toBe('tx-signature-456');
    });
  });

  describe('sendUSDC', () => {
    it('should use devnet USDC mint on devnet', async () => {
      const { getAccount } = require('@solana/spl-token');
      getAccount.mockResolvedValueOnce({});
      mockSignAndSendTransaction.mockResolvedValueOnce('tx-signature-789');

      process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'devnet';

      const { result } = renderHook(() => useCalenSolWallet());

      await act(async () => {
        await result.current.sendUSDC('22222222222222222222222222222222', 100);
      });

      expect(mockSignAndSendTransaction).toHaveBeenCalled();
    });
  });

  describe('TOKENS constant', () => {
    it('should expose TOKENS constant', () => {
      const { result } = renderHook(() => useCalenSolWallet());

      expect(result.current.TOKENS).toHaveProperty('USDC');
      expect(result.current.TOKENS).toHaveProperty('USDC_DEV');
    });
  });

  describe('connection', () => {
    it('should expose connection instance', () => {
      const { result } = renderHook(() => useCalenSolWallet());

      expect(result.current.connection).toBeDefined();
    });
  });
});
