import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";

export const runtime = "nodejs";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export async function POST(req) {
  try {
    const { signature, commitment } = await req.json();
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const connection = new Connection(RPC_URL, commitment || "confirmed");
    const res = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const status = res?.value?.[0] || null;
    return NextResponse.json({ status });
  } catch (err) {
    const message = err?.message || String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


