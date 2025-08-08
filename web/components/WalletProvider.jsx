"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  SolanaMobileWalletAdapter,
  createDefaultAuthorizationResultCache,
  createDefaultAddressSelector,
} from "@solana-mobile/wallet-adapter-mobile";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import "@solana/wallet-adapter-react-ui/styles.css";

export function AppWalletProvider({ children }) {
  const endpoint = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || "https://api.devnet.solana.com";

  const wallets = useMemo(() => {
    const list = [];
    // Always include desktop adapters
    list.push(new PhantomWalletAdapter());
    try { list.push(new BackpackWalletAdapter()); } catch {}
    // Include MWA
    list.push(
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: { name: "yeet@", uri: "https://yeet.at" },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: "devnet",
      })
    );
    return list;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

