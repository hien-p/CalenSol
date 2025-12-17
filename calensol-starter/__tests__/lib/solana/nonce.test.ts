import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  NonceAccount,
} from '@solana/web3.js';
import {
  getConnection,
  createNonceAccountInstructions,
  fetchNonce,
  getNonceAccountInfo,
  buildDurableTransaction,
  isNonceValid,
  createNonceAdvanceInstruction,
  createNonceWithdrawInstruction,
  serializeTransaction,
  deserializeTransaction,
  sendPresignedTransaction,
  confirmTransaction,
  getTransactionStatus,
} from '@/lib/solana/nonce';

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => {
  const originalModule = jest.requireActual('@solana/web3.js');

  return {
    ...originalModule,
    Connection: jest.fn().mockImplementation(() => ({
      getMinimumBalanceForRentExemption: jest.fn(),
      getAccountInfo: jest.fn(),
      sendRawTransaction: jest.fn(),
      confirmTransaction: jest.fn(),
      getSignatureStatus: jest.fn(),
    })),
    NonceAccount: {
      fromAccountData: jest.fn(),
    },
  };
});

describe('lib/solana/nonce.ts', () => {
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = new Connection('https://api.devnet.solana.com') as jest.Mocked<Connection>;
  });

  describe('getConnection', () => {
    it('should create a connection with RPC URL from env', () => {
      const connection = getConnection();

      expect(Connection).toHaveBeenCalledWith(
        process.env.NEXT_PUBLIC_LAZORKIT_RPC_URL || 'https://api.devnet.solana.com',
        'confirmed'
      );
    });
  });

  describe('createNonceAccountInstructions', () => {
    it('should create nonce account instructions', async () => {
      const feePayer = Keypair.generate().publicKey;
      const nonceAuthority = Keypair.generate().publicKey;

      (mockConnection.getMinimumBalanceForRentExemption as jest.Mock).mockResolvedValue(1500000);

      const result = await createNonceAccountInstructions(feePayer, nonceAuthority);

      expect(result).toHaveProperty('nonceKeypair');
      expect(result).toHaveProperty('instructions');
      expect(result.instructions).toHaveLength(2);
    });

    it('should create system program create account instruction', async () => {
      const feePayer = Keypair.generate().publicKey;
      const nonceAuthority = Keypair.generate().publicKey;

      (mockConnection.getMinimumBalanceForRentExemption as jest.Mock).mockResolvedValue(1500000);

      const { instructions } = await createNonceAccountInstructions(feePayer, nonceAuthority);

      // First instruction should be createAccount
      expect(instructions[0].programId.equals(SystemProgram.programId)).toBe(true);
    });
  });

  describe('fetchNonce', () => {
    it('should fetch nonce from account', async () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;
      const mockNonce = 'test-nonce-value';

      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({
        data: Buffer.from('mock-data'),
      });

      (NonceAccount.fromAccountData as jest.Mock).mockReturnValue({
        nonce: mockNonce,
      });

      const nonce = await fetchNonce(nonceAccountPubkey);

      expect(nonce).toBe(mockNonce);
    });

    it('should throw error if nonce account not found', async () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;

      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);

      await expect(fetchNonce(nonceAccountPubkey)).rejects.toThrow('Nonce account not found');
    });
  });

  describe('getNonceAccountInfo', () => {
    it('should return nonce account info', async () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;
      const mockNonceAccount = {
        nonce: 'test-nonce',
        authorizedPubkey: Keypair.generate().publicKey,
      };

      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({
        data: Buffer.from('mock-data'),
      });

      (NonceAccount.fromAccountData as jest.Mock).mockReturnValue(mockNonceAccount);

      const info = await getNonceAccountInfo(nonceAccountPubkey);

      expect(info).toEqual(mockNonceAccount);
    });

    it('should return null if account not found', async () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;

      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue(null);

      const info = await getNonceAccountInfo(nonceAccountPubkey);

      expect(info).toBeNull();
    });
  });

  describe('buildDurableTransaction', () => {
    it('should build a durable transaction with nonce advance', () => {
      const nonce = 'test-nonce';
      const nonceAccountPubkey = Keypair.generate().publicKey;
      const nonceAuthority = Keypair.generate().publicKey;
      const feePayer = Keypair.generate().publicKey;
      const instruction = SystemProgram.transfer({
        fromPubkey: feePayer,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1000000,
      });

      const tx = buildDurableTransaction(
        nonce,
        nonceAccountPubkey,
        nonceAuthority,
        [instruction],
        feePayer
      );

      expect(tx).toBeInstanceOf(Transaction);
      expect(tx.recentBlockhash).toBe(nonce);
      expect(tx.feePayer?.equals(feePayer)).toBe(true);
      // First instruction should be nonce advance
      expect(tx.instructions.length).toBe(2);
    });

    it('should place nonce advance as first instruction', () => {
      const nonce = 'test-nonce';
      const nonceAccountPubkey = Keypair.generate().publicKey;
      const nonceAuthority = Keypair.generate().publicKey;
      const feePayer = Keypair.generate().publicKey;
      const instruction = SystemProgram.transfer({
        fromPubkey: feePayer,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1000000,
      });

      const tx = buildDurableTransaction(
        nonce,
        nonceAccountPubkey,
        nonceAuthority,
        [instruction],
        feePayer
      );

      // First instruction should reference the nonce account
      expect(tx.instructions[0].keys.some(k => k.pubkey.equals(nonceAccountPubkey))).toBe(true);
    });
  });

  describe('isNonceValid', () => {
    it('should return true if nonce matches', async () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;
      const expectedNonce = 'test-nonce';

      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({
        data: Buffer.from('mock-data'),
      });

      (NonceAccount.fromAccountData as jest.Mock).mockReturnValue({
        nonce: expectedNonce,
      });

      const isValid = await isNonceValid(nonceAccountPubkey, expectedNonce);

      expect(isValid).toBe(true);
    });

    it('should return false if nonce does not match', async () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;

      (mockConnection.getAccountInfo as jest.Mock).mockResolvedValue({
        data: Buffer.from('mock-data'),
      });

      (NonceAccount.fromAccountData as jest.Mock).mockReturnValue({
        nonce: 'different-nonce',
      });

      const isValid = await isNonceValid(nonceAccountPubkey, 'expected-nonce');

      expect(isValid).toBe(false);
    });

    it('should return false on error', async () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;

      (mockConnection.getAccountInfo as jest.Mock).mockRejectedValue(new Error('Network error'));

      const isValid = await isNonceValid(nonceAccountPubkey, 'expected-nonce');

      expect(isValid).toBe(false);
    });
  });

  describe('createNonceAdvanceInstruction', () => {
    it('should create nonce advance instruction', () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;
      const nonceAuthority = Keypair.generate().publicKey;

      const instruction = createNonceAdvanceInstruction(nonceAccountPubkey, nonceAuthority);

      expect(instruction.programId.equals(SystemProgram.programId)).toBe(true);
      expect(instruction.keys).toHaveLength(3); // noncePubkey, authorizedPubkey, recentBlockhashes
    });
  });

  describe('createNonceWithdrawInstruction', () => {
    it('should create nonce withdraw instruction', () => {
      const nonceAccountPubkey = Keypair.generate().publicKey;
      const nonceAuthority = Keypair.generate().publicKey;
      const destination = Keypair.generate().publicKey;
      const lamports = 1500000;

      const instruction = createNonceWithdrawInstruction(
        nonceAccountPubkey,
        nonceAuthority,
        destination,
        lamports
      );

      expect(instruction.programId.equals(SystemProgram.programId)).toBe(true);
    });
  });

  describe('serializeTransaction / deserializeTransaction', () => {
    it('should serialize and deserialize transaction', () => {
      const tx = new Transaction();
      const feePayer = Keypair.generate().publicKey;
      const toPubkey = Keypair.generate().publicKey;

      tx.add(
        SystemProgram.transfer({
          fromPubkey: feePayer,
          toPubkey,
          lamports: 1000000,
        })
      );
      tx.recentBlockhash = 'test-blockhash';
      tx.feePayer = feePayer;

      const serialized = serializeTransaction(tx);

      expect(typeof serialized).toBe('string');
      expect(serialized.length).toBeGreaterThan(0);

      const deserialized = deserializeTransaction(serialized);

      expect(deserialized).toBeInstanceOf(Transaction);
      expect(deserialized.recentBlockhash).toBe('test-blockhash');
    });

    it('should produce valid base64 string', () => {
      const tx = new Transaction();
      tx.recentBlockhash = 'test-blockhash';
      tx.feePayer = Keypair.generate().publicKey;

      const serialized = serializeTransaction(tx);

      // Should be valid base64
      expect(() => Buffer.from(serialized, 'base64')).not.toThrow();
    });
  });

  describe('sendPresignedTransaction', () => {
    it('should send raw transaction', async () => {
      const mockSignature = 'mock-signature-123';
      (mockConnection.sendRawTransaction as jest.Mock).mockResolvedValue(mockSignature);

      const base64Tx = Buffer.from('mock-transaction').toString('base64');
      const signature = await sendPresignedTransaction(base64Tx);

      expect(signature).toBe(mockSignature);
      expect(mockConnection.sendRawTransaction).toHaveBeenCalledWith(
        expect.any(Buffer),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        }
      );
    });
  });

  describe('confirmTransaction', () => {
    it('should return true on successful confirmation', async () => {
      (mockConnection.confirmTransaction as jest.Mock).mockResolvedValue({
        value: { err: null },
      });

      const result = await confirmTransaction('mock-signature');

      expect(result).toBe(true);
    });

    it('should return false on failed confirmation', async () => {
      (mockConnection.confirmTransaction as jest.Mock).mockResolvedValue({
        value: { err: { InstructionError: [0, 'Custom'] } },
      });

      const result = await confirmTransaction('mock-signature');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      (mockConnection.confirmTransaction as jest.Mock).mockRejectedValue(
        new Error('Timeout')
      );

      const result = await confirmTransaction('mock-signature');

      expect(result).toBe(false);
    });
  });

  describe('getTransactionStatus', () => {
    it('should return confirmed for confirmed transaction', async () => {
      (mockConnection.getSignatureStatus as jest.Mock).mockResolvedValue({
        value: {
          confirmationStatus: 'confirmed',
          err: null,
        },
      });

      const status = await getTransactionStatus('mock-signature');

      expect(status).toBe('confirmed');
    });

    it('should return confirmed for finalized transaction', async () => {
      (mockConnection.getSignatureStatus as jest.Mock).mockResolvedValue({
        value: {
          confirmationStatus: 'finalized',
          err: null,
        },
      });

      const status = await getTransactionStatus('mock-signature');

      expect(status).toBe('confirmed');
    });

    it('should return failed for errored transaction', async () => {
      (mockConnection.getSignatureStatus as jest.Mock).mockResolvedValue({
        value: {
          confirmationStatus: 'confirmed',
          err: { InstructionError: [0, 'Custom'] },
        },
      });

      const status = await getTransactionStatus('mock-signature');

      expect(status).toBe('failed');
    });

    it('should return pending if status not found', async () => {
      (mockConnection.getSignatureStatus as jest.Mock).mockResolvedValue({
        value: null,
      });

      const status = await getTransactionStatus('mock-signature');

      expect(status).toBe('pending');
    });

    it('should return pending on error', async () => {
      (mockConnection.getSignatureStatus as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const status = await getTransactionStatus('mock-signature');

      expect(status).toBe('pending');
    });
  });
});
