import { NextResponse } from "next/server";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";

export const runtime = "nodejs";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export async function POST(req) {
  try {
    const { rawTx, options, blockhash, lastValidBlockHeight } = await req.json();
    if (!rawTx) {
      return NextResponse.json({ error: "Missing rawTx" }, { status: 400 });
    }

    const connection = new Connection(RPC_URL, "confirmed");

    const raw = typeof rawTx === "string" ? Buffer.from(rawTx, "base64") : Buffer.from(rawTx);

    // If caller did not explicitly skip preflight, perform a simulate to surface logs
    const shouldPreflight = !(options?.skipPreflight === true);
    if (shouldPreflight) {
      try {
        let txForSim;
        try {
          txForSim = VersionedTransaction.deserialize(raw);
        } catch (_) {
          txForSim = Transaction.from(raw);
        }
        const sim = await connection.simulateTransaction(txForSim, {
          sigVerify: true,
          commitment: options?.preflightCommitment ?? "confirmed",
        });
        if (sim.value?.err) {
          const logs = sim.value?.logs || null;
          const errStr = typeof sim.value.err === "string" ? sim.value.err : JSON.stringify(sim.value.err);
          return NextResponse.json(
            { error: `Simulation failed: ${errStr}`, logs },
            { status: 400 }
          );
        }
      } catch (e) {
        // If simulation itself throws, return details
        return NextResponse.json(
          { error: e?.message || String(e) },
          { status: 400 }
        );
      }
    }

    let signature;
    signature = await connection.sendRawTransaction(raw, {
      skipPreflight: true, // we've already simulated above if requested
      maxRetries: options?.maxRetries ?? 3,
      preflightCommitment: options?.preflightCommitment ?? "confirmed",
    });

    let status = null;
    try {
      const commitment = options?.commitment ?? "confirmed";
      if (blockhash && lastValidBlockHeight) {
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, commitment);
      } else {
        await connection.confirmTransaction(signature, commitment);
      }
      const statuses = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      status = statuses?.value?.[0] || null;
    } catch (_) {
      // ignore confirm errors; client can continue polling if needed
    }

    return NextResponse.json({ signature, status });
  } catch (err) {
    const message = err?.message || String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


