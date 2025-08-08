"use client";
import React from "react";
import ConnectButton from "@/components/ConnectButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";

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

  const handlePost = async (e) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    if (!connected || !publicKey || !wallet) {
      showWalletSelectionModal(true);
      return;
    }
    const programIdStr = process.env.NEXT_PUBLIC_MICROBLOG_PROGRAM_ID;
    if (!programIdStr) {
      setErrorMsg("Program ID not set. Configure NEXT_PUBLIC_MICROBLOG_PROGRAM_ID.");
      return;
    }
    try {
      setPosting(true);
      setErrorMsg("");
      const programId = new PublicKey(programIdStr);

      // Derive or look up user profile (with seed, owned by program)
      const userSeed = "user";
      const userProfilePubkey = await PublicKey.createWithSeed(publicKey, userSeed, programId);
      const userAcct = await connection.getAccountInfo(userProfilePubkey);

      const instructions = [];
      // Add compute budget hints (helps wallet simulation warnings)
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
      );

      // If profile missing, create with seed then init_user
      const preview = [];
      if (!userAcct) {
        preview.push("Create user account");
        const userSpace = 1 + 8; // discriminator + post_count
        const userLamports = await connection.getMinimumBalanceForRentExemption(userSpace);
        instructions.push(
          SystemProgram.createAccountWithSeed({
            fromPubkey: publicKey,
            basePubkey: publicKey,
            seed: userSeed,
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
            data: Buffer.from([0]), // InitUser
          })
        );
      }

      // Read current post_count (default 0 if not initialized)
      let postIndex = 0;
      const freshUserAcct = await connection.getAccountInfo(userProfilePubkey);
      if (freshUserAcct && freshUserAcct.owner.equals(programId) && freshUserAcct.data?.length >= 9) {
        // bytes [1..9) little-endian u64
        postIndex = Number(new DataView(freshUserAcct.data.buffer, freshUserAcct.data.byteOffset + 1, 8).getBigUint64(0, true));
      }

      const postSeed = `post-${postIndex}`;
      const postPubkey = await PublicKey.createWithSeed(publicKey, postSeed, programId);
      const postAcct = await connection.getAccountInfo(postPubkey);
      const postSpace = 1 + 32 + 8 + 2 + Buffer.byteLength(text, "utf8");
      if (!postAcct) {
        preview.push("Create post account");
        const postLamports = await connection.getMinimumBalanceForRentExemption(postSpace);
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
      const data = Buffer.concat([Buffer.from([1]), Buffer.from(text, "utf8")]);
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

      const tx = new Transaction().add(...instructions);
      // Ensure fee payer and blockhash set for better UX
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const sig = await sendTransaction(tx, connection, { skipPreflight: false });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      // Clear composer on success
      setContent("");
      setLastSig(sig);
      setTxConfirmed(true);
      // Optimistically add to local list so it appears immediately
      setLocalPosts((prev) => [
        { index: postIndex, content: text, author: publicKey.toBase58(), sig },
        ...prev,
      ]);
      // Optional: console link
      console.log(`Posted: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    } catch (err) {
      const msg = (err && (err.message || err.toString())) || "Failed to post";
      if (msg.toLowerCase().includes("rejected")) {
        // user canceled; keep composer content
        setErrorMsg("Transaction approval was canceled");
      } else {
        setErrorMsg("Failed to post. Check wallet and network.");
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
        const programIdStr = process.env.NEXT_PUBLIC_MICROBLOG_PROGRAM_ID;
        if (!programIdStr) return;
        const programId = new PublicKey(programIdStr);
        const userProfilePubkey = await PublicKey.createWithSeed(publicKey, "user", programId);
        const userAcct = await connection.getAccountInfo(userProfilePubkey);
        if (!userAcct || userAcct.data.length < 9) return;
        const postCount = Number(new DataView(userAcct.data.buffer, userAcct.data.byteOffset + 1, 8).getBigUint64(0, true));
        const results = [];
        for (let i = 0; i < postCount; i++) {
          const postPubkey = await PublicKey.createWithSeed(publicKey, `post-${i}`, programId);
          const postAcct = await connection.getAccountInfo(postPubkey);
          if (!postAcct || postAcct.data.length < 43) continue;
          const len = postAcct.data.readUInt16LE(41);
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
  }, [connected, publicKey, connection]);

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
              Posted! View on <a className="underline" href={`https://solscan.io/tx/${lastSig}?cluster=devnet`} target="_blank" rel="noreferrer">Solscan</a>
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
              <a className="underline" href={`/u/${p.author}/${p.index}`}>#{p.index}</a>
              <p className="mt-1 whitespace-pre-wrap break-words">{p.content}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
