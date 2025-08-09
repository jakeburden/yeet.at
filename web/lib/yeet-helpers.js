"use client";
import { PublicKey } from "@solana/web3.js";

export const USER_SEED = "user";
export const EXPECTED_USER_SIZE = 1 + 32 + 8; // discriminant + owner + post_count
export const POST_HEADER_BASE_SIZE = 1 + 32 + 8 + 2;

export function getYeetProgramIdStr() {
  return process.env.NEXT_PUBLIC_YEET_PROGRAM_ID || process.env.NEXT_PUBLIC_MICROBLOG_PROGRAM_ID || "";
}

export function getYeetProgramId() {
  const id = getYeetProgramIdStr();
  if (!id) throw new Error("Program ID not set. Configure NEXT_PUBLIC_YEET_PROGRAM_ID.");
  return new PublicKey(id);
}

export function computeUserSpace() {
  return EXPECTED_USER_SIZE;
}

export function computePostSpace(textUtf8BytesLength) {
  return POST_HEADER_BASE_SIZE + textUtf8BytesLength;
}

export function parsePostCountFromUserData(bufferLike) {
  if (!bufferLike || bufferLike.length < EXPECTED_USER_SIZE) return 0;
  const dv = new DataView(bufferLike.buffer, bufferLike.byteOffset + 33, 8);
  return Number(dv.getBigUint64(0, true));
}

export function postDiscriminant() { return 1; }
export function userInitDiscriminant() { return 0; }


