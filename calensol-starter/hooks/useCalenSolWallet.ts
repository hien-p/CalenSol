'use client';

import { useWallet } from '@lazorkit/wallet';
import { 
  PublicKey, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  Connection,
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { useCallback } from 'react';

// Common token mints
const TOKENS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet USDC
  USDC_DEV: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet USDC
} as const;

export function useCalenSolWallet() {
  const {
    smartWalletPubkey,
    isConnected,
    isLoading,
    isConnecting,
    isSigning,
    error,
    account,
    connect,
    disconnect,
    signTransaction,
    signAndSendTransaction,
  } = useWallet();

  const connection = new Connection(
    process.env.NEXT_PUBLIC_LAZORKIT_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  );

  // Connect wallet with passkey (Face ID / Touch ID)
  const connectWallet = useCallback(async () => {
    try {
      const walletAccount = await connect();
      console.log('✅ Connected wallet:', walletAccount.smartWallet);
      return walletAccount;
    } catch (err) {
      console.error('❌ Failed to connect:', err);
      throw err;
    }
  }, [connect]);

  // Get SOL balance
  const getSolBalance = useCallback(async (): Promise<number> => {
    if (!smartWalletPubkey) return 0;
    try {
      const balance = await connection.getBalance(smartWalletPubkey);
      return balance / LAMPORTS_PER_SOL;
    } catch (err) {
      console.error('Failed to get SOL balance:', err);
      return 0;
    }
  }, [smartWalletPubkey, connection]);

  // Create SOL transfer instruction
  const createSolTransferInstruction = useCallback((
    toPubkey: string,
    lamports: number
  ): TransactionInstruction => {
    if (!smartWalletPubkey) throw new Error('Wallet not connected');
    
    return SystemProgram.transfer({
      fromPubkey: smartWalletPubkey,
      toPubkey: new PublicKey(toPubkey),
      lamports,
    });
  }, [smartWalletPubkey]);

  // Create SPL token transfer instruction
  const createTokenTransferInstruction = useCallback(async (
    tokenMint: string,
    toPubkey: string,
    amount: number,
    decimals: number = 6
  ): Promise<TransactionInstruction[]> => {
    if (!smartWalletPubkey) throw new Error('Wallet not connected');
    
    const mintPubkey = new PublicKey(tokenMint);
    const recipientPubkey = new PublicKey(toPubkey);
    
    const fromAta = await getAssociatedTokenAddress(
      mintPubkey,
      smartWalletPubkey
    );
    
    const toAta = await getAssociatedTokenAddress(
      mintPubkey,
      recipientPubkey
    );
    
    const instructions: TransactionInstruction[] = [];
    
    // Check if recipient ATA exists
    try {
      await getAccount(connection, toAta);
    } catch {
      // Create ATA if it doesn't exist
      instructions.push(
        createAssociatedTokenAccountInstruction(
          smartWalletPubkey, // payer
          toAta,
          recipientPubkey,
          mintPubkey
        )
      );
    }
    
    // Add transfer instruction
    instructions.push(
      createTransferInstruction(
        fromAta,
        toAta,
        smartWalletPubkey,
        BigInt(amount * Math.pow(10, decimals)),
        [],
        TOKEN_PROGRAM_ID
      )
    );
    
    return instructions;
  }, [smartWalletPubkey, connection]);

  // Execute SOL transfer (gasless via paymaster)
  const sendSol = useCallback(async (
    toPubkey: string,
    amount: number
  ): Promise<string> => {
    if (!smartWalletPubkey) throw new Error('Wallet not connected');

    console.log(`📤 Sending ${amount} SOL to ${toPubkey}...`);
    
    const instruction = createSolTransferInstruction(
      toPubkey,
      amount * LAMPORTS_PER_SOL
    );

    const signature = await signAndSendTransaction(instruction);
    console.log('✅ Transaction sent:', signature);
    
    return signature;
  }, [smartWalletPubkey, createSolTransferInstruction, signAndSendTransaction]);

  // Execute token transfer (gasless via paymaster)
  const sendToken = useCallback(async (
    tokenMint: string,
    toPubkey: string,
    amount: number,
    decimals: number = 6
  ): Promise<string> => {
    if (!smartWalletPubkey) throw new Error('Wallet not connected');

    console.log(`📤 Sending ${amount} tokens to ${toPubkey}...`);
    
    const instructions = await createTokenTransferInstruction(
      tokenMint,
      toPubkey,
      amount,
      decimals
    );

    // For multiple instructions, we need to handle differently
    // LazorKit's signAndSendTransaction takes a single instruction
    // So we send them one by one (or combine for ATA creation + transfer)
    let signature = '';
    for (const instruction of instructions) {
      signature = await signAndSendTransaction(instruction);
    }
    
    console.log('✅ Transaction sent:', signature);
    return signature;
  }, [smartWalletPubkey, createTokenTransferInstruction, signAndSendTransaction]);

  // Send USDC specifically (common use case)
  const sendUSDC = useCallback(async (
    toPubkey: string,
    amount: number
  ): Promise<string> => {
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
    const usdcMint = network === 'mainnet-beta' ? TOKENS.USDC : TOKENS.USDC_DEV;
    return sendToken(usdcMint, toPubkey, amount, 6);
  }, [sendToken]);

  return {
    // State
    walletAddress: smartWalletPubkey?.toBase58(),
    publicKey: smartWalletPubkey,
    isConnected,
    isLoading: isLoading || isConnecting || isSigning,
    isConnecting,
    isSigning,
    error,
    account,
    
    // Core actions
    connect: connectWallet,
    disconnect,
    
    // Balance
    getSolBalance,
    
    // Transfers (gasless!)
    sendSol,
    sendToken,
    sendUSDC,
    
    // Low-level signing
    signTransaction,
    signAndSendTransaction,
    
    // Instruction builders
    createSolTransferInstruction,
    createTokenTransferInstruction,
    
    // Connection
    connection,
    
    // Constants
    TOKENS,
  };
}

// Export types
export type CalenSolWallet = ReturnType<typeof useCalenSolWallet>;
