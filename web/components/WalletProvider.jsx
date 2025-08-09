"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { SolanaMobileWalletAdapter } from "@solana-mobile/wallet-adapter-mobile";
import "@solana/wallet-adapter-react-ui/styles.css";

export function AppWalletProvider({ children }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

  const wallets = useMemo(() => {
    return [
      new PhantomWalletAdapter(),
      new BackpackWalletAdapter(),
      new SolanaMobileWalletAdapter({ appIdentity: { name: "yeet@" } }),
    ];
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "processed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

