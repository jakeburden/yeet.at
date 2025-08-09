"use client";
import React from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { POST_HEADER_BASE_SIZE, getYeetProgramIdStr } from "@/lib/yeet-helpers";

export default function PostPage({ params }) {
  const resolvedParams = params && typeof params.then === "function" ? React.use(params) : params;
  const { author, index } = resolvedParams ?? {};
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
        const view = new DataView(
          postAcct.data.buffer,
          postAcct.data.byteOffset,
          postAcct.data.byteLength
        );
        const len = view.getUint16(POST_HEADER_BASE_SIZE - 2, true);
        const slice = postAcct.data.subarray(POST_HEADER_BASE_SIZE, POST_HEADER_BASE_SIZE + len);
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

