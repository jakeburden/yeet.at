"use client";
import React from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { EXPECTED_USER_SIZE, getYeetProgramIdStr } from "@/lib/yeet-helpers";

export default function UserPosts({ params }) {
  const resolvedParams = params && typeof params.then === "function" ? React.use(params) : params;
  const { author } = resolvedParams ?? {};
  const [posts, setPosts] = React.useState([]);
  const { connection } = useConnection();

  React.useEffect(() => {
    (async () => {
      try {
        const programIdStr = getYeetProgramIdStr();
        if (!programIdStr || !author) return;
        const programId = new PublicKey(programIdStr);
        const authorPk = new PublicKey(author);
        // Derive user profile and read post_count
        const userProfilePubkey = await PublicKey.createWithSeed(authorPk, "user", programId);
        const userAcct = await connection.getAccountInfo(userProfilePubkey);
        if (!userAcct || !userAcct.data || userAcct.data.length < EXPECTED_USER_SIZE) {
          setPosts([]);
          return;
        }
        const postCount = Number(
          new DataView(userAcct.data.buffer, userAcct.data.byteOffset + 33, 8).getBigUint64(0, true)
        );
        const results = [];
        for (let i = 0; i < postCount; i++) {
          const postPubkey = await PublicKey.createWithSeed(authorPk, `post-${i}`, programId);
          const postAcct = await connection.getAccountInfo(postPubkey);
          if (!postAcct || !postAcct.data || postAcct.data.length < 43) continue;
          const idx = Number(
            new DataView(postAcct.data.buffer, postAcct.data.byteOffset + 33, 8).getBigUint64(0, true)
          );
          const len = new DataView(
            postAcct.data.buffer,
            postAcct.data.byteOffset,
            postAcct.data.byteLength
          ).getUint16(41, true);
          const slice = postAcct.data.subarray(43, 43 + len);
          const text = new TextDecoder().decode(slice);
          results.push({ pubkey: postPubkey.toBase58(), index: idx, content: text });
        }
        results.sort((a, b) => b.index - a.index);
        setPosts(results);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [author, connection]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold break-all">Posts by {author}</h1>
      <ul className="space-y-3">
        {posts.map((p) => (
          <li key={p.pubkey} className="border rounded p-3">
            <Link href={`/u/${author}/${p.index}`} className="underline">#{p.index}</Link>
            <p className="mt-1 whitespace-pre-wrap break-words">{p.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
