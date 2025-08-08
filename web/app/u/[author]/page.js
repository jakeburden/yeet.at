"use client";
import React, { use as usePromise } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

export default function UserPosts({ params }) {
  const { author } = usePromise(params);
  const [posts, setPosts] = React.useState([]);
  const { connection } = useConnection();

  React.useEffect(() => {
    (async () => {
      try {
        const programIdStr = process.env.NEXT_PUBLIC_MICROBLOG_PROGRAM_ID;
        if (!programIdStr) return;
        const programId = new PublicKey(programIdStr);
        const authorPk = new PublicKey(author);
        // Derive user profile and read post_count
        const userProfilePubkey = await PublicKey.createWithSeed(authorPk, "user", programId);
        const userAcct = await connection.getAccountInfo(userProfilePubkey);
        if (!userAcct || !userAcct.data || userAcct.data.length < 9) {
          setPosts([]);
          return;
        }
        const postCount = Number(new DataView(userAcct.data.buffer, userAcct.data.byteOffset + 1, 8).getBigUint64(0, true));
        const results = [];
        for (let i = 0; i < postCount; i++) {
          const postPubkey = await PublicKey.createWithSeed(authorPk, `post-${i}`, programId);
          const postAcct = await connection.getAccountInfo(postPubkey);
          if (!postAcct || !postAcct.data || postAcct.data.length < 43) continue;
          const idx = Number(new DataView(postAcct.data.buffer, postAcct.data.byteOffset + 33, 8).getBigUint64(0, true));
          const len = postAcct.data.readUInt16LE(41);
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
  }, [author]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold break-all">Posts by {author}</h1>
      <ul className="space-y-3">
        {posts.map((p) => (
          <li key={p.pubkey} className="border rounded p-3">
            <a href={`/u/${author}/${p.index}`} className="underline">#{p.index}</a>
            <p className="mt-1 whitespace-pre-wrap break-words">{p.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
