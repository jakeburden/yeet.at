import {
  EXPECTED_USER_SIZE,
  POST_HEADER_BASE_SIZE,
  computeUserSpace,
  computePostSpace,
  parsePostCountFromUserData,
  userInitDiscriminant,
  postDiscriminant,
} from "@/lib/yeet-helpers";

describe("yeet helpers", () => {
  test("user size constants", () => {
    expect(EXPECTED_USER_SIZE).toBe(41);
    expect(computeUserSpace()).toBe(41);
  });

  test("post base header size", () => {
    expect(POST_HEADER_BASE_SIZE).toBe(1 + 32 + 8 + 2);
    expect(computePostSpace(0)).toBe(POST_HEADER_BASE_SIZE);
    expect(computePostSpace(10)).toBe(POST_HEADER_BASE_SIZE + 10);
  });

  test("parse post_count from user data at offset 33", () => {
    const buf = new Uint8Array(EXPECTED_USER_SIZE);
    // set initialized discriminant
    buf[0] = 1;
    // owner bytes [1..33) left zero
    // set post_count little-endian at [33..41)
    const count = 42n;
    const le = new Uint8Array(new BigUint64Array([count]).buffer);
    buf.set(le, 33);
    expect(parsePostCountFromUserData(buf)).toBe(Number(count));
  });

  test("discriminants", () => {
    expect(userInitDiscriminant()).toBe(0);
    expect(postDiscriminant()).toBe(1);
  });
});


