"use client";
import React from "react";
import Link from "next/link";
import ConnectButton from "@/components/ConnectButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { USER_SEED, EXPECTED_USER_SIZE, POST_HEADER_BASE_SIZE, getYeetProgramIdStr } from "@/lib/yeet-helpers";

export default function Home() {
  const [content, setContent] = React.useState("");
  const [posting, setPosting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [lastSig, setLastSig] = React.useState("");
  const [localPosts, setLocalPosts] = React.useState([]);
  const [txPreview, setTxPreview] = React.useState([]);
  const [txConfirmed, setTxConfirmed] = React.useState(false);
  const { publicKey, connected, wallet, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible: showWalletSelectionModal } = useWalletModal();
  const PROGRAM_ID_STR = getYeetProgramIdStr();

  const resolveUserProfileAccount = React.useCallback(async () => {
    if (!publicKey) return { pubkey: null, acct: null };
    if (!PROGRAM_ID_STR) return { pubkey: null, acct: null };
    const programId = new PublicKey(PROGRAM_ID_STR);
    const pubkey = await PublicKey.createWithSeed(publicKey, USER_SEED, programId);
    const acct = await connection.getAccountInfo(pubkey);
    return { pubkey, acct };
  }, [publicKey, connection, PROGRAM_ID_STR]);

  async function simulateAndSend(tx) {
    // Fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    // Preflight
    try {
      const sim = await connection.simulateTransaction(tx, { sigVerify: false, commitment: "processed" });
      if (sim.value?.err) {
        const logs = sim.value?.logs || [];
        console.error("simulation failed", sim.value.err, logs);
        setErrorMsg((logs && logs.join("\n")) || "Simulation failed");
        return null;
      }
    } catch (_) {}
    // Try standard adapter sendTransaction first
    try {
      const sig = await sendTransaction(tx, connection, { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      return sig;
    } catch (sendErr) {
      console.warn("sendTransaction failed", sendErr);
      // Fall back to sign+raw only if supported by the selected wallet
      try {
        if (!wallet?.signTransaction) throw sendErr;
        const signed = await wallet.signTransaction(tx);
        const raw = signed.serialize();
        const sig = await connection.sendRawTransaction(raw, { skipPreflight: false });
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        return sig;
      } catch (rawErr) {
        console.error("raw send failed", rawErr);
        const msg = rawErr?.message || rawErr?.toString?.() || "Send failed";
        setErrorMsg(`Failed to post: ${msg}`);
        return null;
      }
    }
  }

  const handlePost = async (e) => {
    e.preventDefault();
    if (posting) return;
    const text = content.trim();
    if (!text) return;
    // Enforce on-chain max of 512 bytes (program validates bytes, not chars)
    if (new TextEncoder().encode(text).length > 512) {
      setErrorMsg("Post is over 512 bytes when UTF-8 encoded.");
      return;
    }
    if (!connected || !publicKey || !wallet) {
      showWalletSelectionModal(true);
      return;
    }
    if (!PROGRAM_ID_STR) {
      setErrorMsg("Program ID not set. Configure NEXT_PUBLIC_YEET_PROGRAM_ID.");
      return;
    }
    try {
      setPosting(true);
      setErrorMsg("");
      const programId = new PublicKey(PROGRAM_ID_STR);

      // Resolve user profile account (migrate from legacy undersized account if needed)
      const { pubkey: userProfilePubkey, acct: userAcct } = await resolveUserProfileAccount();

      const instructions = [];
      // Add compute budget hints (helps wallet simulation warnings)
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
      );

      // If profile missing, create with seed then init_user
      const preview = [];
      let userLamports = 0;
      if (!userAcct) {
        preview.push("Create user account");
        const userSpace = EXPECTED_USER_SIZE; // discriminator + owner + post_count
        userLamports = await connection.getMinimumBalanceForRentExemption(userSpace);
        instructions.push(
          SystemProgram.createAccountWithSeed({
            fromPubkey: publicKey,
            basePubkey: publicKey,
            seed: USER_SEED,
            newAccountPubkey: userProfilePubkey,
            lamports: userLamports,
            space: userSpace,
            programId,
          })
        );
        preview.push("Init user");
        instructions.push(
          new TransactionInstruction({
            programId,
            keys: [
              { pubkey: publicKey, isSigner: true, isWritable: false },
              { pubkey: userProfilePubkey, isSigner: false, isWritable: true },
            ],
            data: new Uint8Array([0]), // InitUser
          })
        );
      } else if (userAcct.data?.[0] !== 1) {
        // Account exists but not initialized yet
        preview.push("Init user");
        instructions.push(
          new TransactionInstruction({
            programId,
            keys: [
              { pubkey: publicKey, isSigner: true, isWritable: false },
              { pubkey: userProfilePubkey, isSigner: false, isWritable: true },
            ],
            data: new Uint8Array([0]),
          })
        );
      }

      // Read current post_count (default 0 if not initialized)
      let postIndex = 0;
      const freshUserAcct = await connection.getAccountInfo(userProfilePubkey);
      if (freshUserAcct && freshUserAcct.owner.equals(programId) && freshUserAcct.data?.length >= EXPECTED_USER_SIZE) {
        // bytes [33..41) little-endian u64 (after 1-byte discriminant and 32-byte owner)
        postIndex = Number(new DataView(freshUserAcct.data.buffer, freshUserAcct.data.byteOffset + 33, 8).getBigUint64(0, true));
      }

      const postSeed = `post-${postIndex}`;
      const postPubkey = await PublicKey.createWithSeed(publicKey, postSeed, programId);
      const postAcct = await connection.getAccountInfo(postPubkey);
      const postTextBytes = new TextEncoder().encode(text);
      const postSpace = POST_HEADER_BASE_SIZE + postTextBytes.length;
      let postLamports = 0;
      if (!postAcct) {
        preview.push("Create post account");
        postLamports = await connection.getMinimumBalanceForRentExemption(postSpace);
        instructions.push(
          SystemProgram.createAccountWithSeed({
            fromPubkey: publicKey,
            basePubkey: publicKey,
            seed: postSeed,
            newAccountPubkey: postPubkey,
            lamports: postLamports,
            space: postSpace,
            programId,
          })
        );
      }

      // CreatePost
      const data = new Uint8Array(1 + postTextBytes.length);
      data[0] = 1;
      data.set(postTextBytes, 1);
      preview.push("Create post");
      instructions.push(
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: false },
            { pubkey: userProfilePubkey, isSigner: false, isWritable: true },
            { pubkey: postPubkey, isSigner: false, isWritable: true },
          ],
          data,
        })
      );

      setTxPreview(preview);
      setTxConfirmed(false);

      // Balance pre-check to avoid wallet adapter's generic error
      try {
        const balance = await connection.getBalance(publicKey, "processed");
        const estFees = 8_000; // single tx
        const required = (userAcct ? 0 : userLamports) + (postAcct ? 0 : postLamports) + estFees;
        if (balance < required) {
          const toSol = (lamps) => (lamps / 1_000_000_000).toFixed(6);
          setErrorMsg(`Insufficient funds: need ~${toSol(required)} SOL, have ${toSol(balance)} SOL.`);
          return;
        }
      } catch (_) {}

      // Ensure sufficient lamports (rent + fees). If low, request a small airdrop on devnet first
      // no auto-airdrop; user funds accounts manually

      // Build and send single transaction
      const tx = new Transaction().add(...instructions);
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      // Send via our simulateAndSend helper (sign+raw path)
      const sig = await simulateAndSend(tx);
      if (!sig) return;
      // Clear composer on success
      setContent("");
      setLastSig(sig);
      setTxConfirmed(true);
      // Optimistically add to local list so it appears immediately
      setLocalPosts((prev) => [
        { index: postIndex, content: text, author: publicKey.toBase58(), sig },
        ...prev,
      ]);
      // Optional: console link printed above for each tx
    } catch (err) {
      const msg = (err && (err.message || err.toString())) || "Failed to post";
      if (msg.toLowerCase().includes("rejected")) {
        // user canceled; keep composer content
        setErrorMsg("Transaction approval was canceled");
      } else {
        setErrorMsg(`Failed to post: ${msg}`);
      }
      console.error("post failed", err);
    } finally {
      setPosting(false);
    }
  };

  // Fetch all of the connected user's posts with contents
  React.useEffect(() => {
    (async () => {
      if (!connected || !publicKey) return;
      try {
        if (!PROGRAM_ID_STR) return;
        const programId = new PublicKey(PROGRAM_ID_STR);
        const { pubkey: userProfilePubkey, acct: userAcct } = await resolveUserProfileAccount();
        if (!userAcct || userAcct.data.length < EXPECTED_USER_SIZE) return;
        const postCount = Number(new DataView(userAcct.data.buffer, userAcct.data.byteOffset + 33, 8).getBigUint64(0, true));
        const results = [];
        for (let i = 0; i < postCount; i++) {
          const postPubkey = await PublicKey.createWithSeed(publicKey, `post-${i}`, programId);
          const postAcct = await connection.getAccountInfo(postPubkey);
          if (!postAcct || postAcct.data.length < 43) continue;
          const len = new DataView(
            postAcct.data.buffer,
            postAcct.data.byteOffset,
            postAcct.data.byteLength
          ).getUint16(41, true);
          const slice = postAcct.data.subarray(43, 43 + len);
          const text = new TextDecoder().decode(slice);
          const idx = Number(new DataView(postAcct.data.buffer, postAcct.data.byteOffset + 33, 8).getBigUint64(0, true));
          results.push({ index: idx, content: text, author: publicKey.toBase58() });
        }
        results.sort((a, b) => b.index - a.index);
        setLocalPosts(results);
      } catch (e) {
        // ignore
      }
    })();
  }, [connected, publicKey, connection, resolveUserProfileAccount, PROGRAM_ID_STR]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">yeet@</h1>
        <ConnectButton />
      </div>

      <form className="space-y-3" onSubmit={handlePost}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={512}
          placeholder="What's happening?"
          className="w-full border rounded p-3 min-h-[120px]"
        />
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        {lastSig && (
          <div className="text-sm space-y-1">
            <p>
              Posted! View on <a className="underline" href={`https://solscan.io/tx/${lastSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Solscan</a>
            </p>
            {txPreview.length > 0 && (
              <div className="rounded border p-2">
                <p className="font-medium mb-1">On-chain actions</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {txPreview.map((step, i) => (
                    <li key={i}>{step}{txConfirmed ? " ✅" : ""}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={posting || !content.trim()}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {posting ? "Posting…" : "Post"}
        </button>
      </form>

      <section>
        <h2 className="font-semibold mb-2">Your yeets</h2>
        <p className="text-sm text-gray-500">View yeets at /u/[address]</p>
        <ul className="mt-3 space-y-3">
          {localPosts.map((p) => (
            <li key={`${p.author}-${p.index}`} className="border rounded p-3">
              <Link className="underline" href={`/u/${p.author}/${p.index}`}>#{p.index}</Link>
              <p className="mt-1 whitespace-pre-wrap break-words">{p.content}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
