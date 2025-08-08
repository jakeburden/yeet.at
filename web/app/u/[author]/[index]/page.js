"use client";
import React from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

export default function PostPage({ params }) {
  const { author, index } = React.use(params);
  const [content, setContent] = React.useState("");
  const { connection } = useConnection();

  React.useEffect(() => {
    (async () => {
      try {
        const programIdStr = process.env.NEXT_PUBLIC_MICROBLOG_PROGRAM_ID;
        if (!programIdStr) return;
        const programId = new PublicKey(programIdStr);
        const authorPk = new PublicKey(author);
        const postPubkey = await PublicKey.createWithSeed(authorPk, `post-${index}`, programId);
        const postAcct = await connection.getAccountInfo(postPubkey);
        if (!postAcct) return;
        setContent(readContentFromAccount([postAcct.data.toString("base64")]));
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

function decodeAccountData(raw) {
  const b64 = Array.isArray(raw) ? raw[0] : raw;
  if (!b64 || typeof b64 !== "string") return Buffer.alloc(0);
  return Buffer.from(b64, "base64");
}

function readContentFromAccount(raw) {
  const b = decodeAccountData(raw);
  if (b.length < 43) return "";
  const len = b.readUInt16LE(41);
  const slice = b.subarray(43, 43 + len);
  return new TextDecoder().decode(slice);
}

