"use client";
import { createSolanaClient } from "gill";

const urlOrMoniker = process.env.NEXT_PUBLIC_RPC_URL || "devnet";

export const { rpc, rpcSubscriptions, sendAndConfirmTransaction } = createSolanaClient({
  urlOrMoniker,
});
