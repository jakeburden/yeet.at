"use client";
import React, { useEffect, useMemo, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { SolanaMobileWalletAdapterWalletName } from "@solana-mobile/wallet-adapter-mobile";

export default function ConnectButton() {
  const { connected, wallet, wallets, select, connecting, disconnect } = useWallet();
  const { setVisible: showWalletSelectionModal } = useWalletModal();

  const mobileWalletAdapter = useMemo(
    () => wallets.find((w) => w.adapter?.name === SolanaMobileWalletAdapterWalletName),
    [wallets]
  );

  const lastAttemptAdapterNameRef = useRef(null);

  // Auto-connect once when a selected wallet is ready (prevents repeated attempts)
  useEffect(() => {
    if (!wallet || connected || connecting) return;
    const state = wallet.adapter?.readyState;
    if (state === WalletReadyState.Installed || state === WalletReadyState.Loadable) {
      if (lastAttemptAdapterNameRef.current !== wallet.adapter.name) {
        lastAttemptAdapterNameRef.current = wallet.adapter.name;
        wallet.adapter.connect().catch(() => {});
      }
    }
  }, [wallet, connected, connecting]);

  // Auto-select MWA early if available and not selected
  useEffect(() => {
    if (!wallet && mobileWalletAdapter && /Android/i.test(navigator.userAgent)) {
      select(SolanaMobileWalletAdapterWalletName);
    }
  }, [wallet, mobileWalletAdapter, select]);

  async function handleConnectClick() {
    try {
      const ready = wallet?.adapter?.readyState === "Installed" || wallet?.adapter?.readyState === "Loadable";
      if (wallet?.adapter?.name === SolanaMobileWalletAdapterWalletName) {
        await wallet.adapter.connect();
      } else if (mobileWalletAdapter) {
        select(SolanaMobileWalletAdapterWalletName);
        // Defer a tick to allow provider state to update
        setTimeout(async () => {
          try { await mobileWalletAdapter.adapter.connect(); } catch {}
        }, 0);
      } else if (wallet && ready) {
        await wallet.adapter.connect();
      } else {
        showWalletSelectionModal(true);
      }
    } catch (e) {
      console.error("wallet connect error", e);
    }
  }

  if (connected) {
    return (
      <button onClick={() => disconnect()} className="px-3 py-2 rounded border">
        Disconnect
      </button>
    );
  }

  return (
    <button onClick={handleConnectClick} disabled={connecting} className="px-3 py-2 rounded bg-black text-white">
      {connecting ? "Connecting..." : mobileWalletAdapter ? "Use Installed Wallet" : "Connect Wallet"}
    </button>
  );
}
