"use client";
import React, { use as usePromise } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { POST_HEADER_BASE_SIZE, getYeetProgramIdStr } from "@/lib/yeet-helpers";

export default function PostPage({ params }) {
  const { author, index } = usePromise(params);
  const [content, setContent] = React.useState("");
  const { connection } = useConnection();

  React.useEffect(() => {
    (async () => {
      try {
        const programIdStr = getYeetProgramIdStr();
        if (!programIdStr || !author || typeof index === "undefined") return;
        const programId = new PublicKey(programIdStr);
        const authorPk = new PublicKey(author);
        const postPubkey = await PublicKey.createWithSeed(authorPk, `post-${index}`, programId);
        const postAcct = await connection.getAccountInfo(postPubkey);
        if (!postAcct || !postAcct.data || postAcct.data.length < POST_HEADER_BASE_SIZE) return;
        const buf = postAcct.data;
        const len = buf.readUInt16LE(41);
        const slice = buf.subarray(POST_HEADER_BASE_SIZE, POST_HEADER_BASE_SIZE + len);
        setContent(new TextDecoder().decode(slice));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [author, index, connection]);

  return (
    <article className="prose max-w-none">
      <h1 className="text-xl font-semibold mb-2">Post #{index}</h1>
      <p className="whitespace-pre-wrap break-words">{content}</p>
    </article>
  );
}

