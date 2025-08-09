import { POST_HEADER_BASE_SIZE } from "@/lib/yeet-helpers";

function buildCreatePostData(text) {
  const textBytes = new TextEncoder().encode(text);
  const buf = new Uint8Array(1 + textBytes.length);
  buf[0] = 1; // CreatePost discriminant
  buf.set(textBytes, 1);
  return buf;
}

describe("builders", () => {
  test("create post data layout", () => {
    const data = buildCreatePostData("hi");
    expect(data[0]).toBe(1);
    expect(data.length).toBe(3);
  });

  test("post space math aligns", () => {
    const text = "hello";
    const textBytes = new TextEncoder().encode(text);
    const total = POST_HEADER_BASE_SIZE + textBytes.length;
    expect(total).toBe((1 + 32 + 8 + 2) + 5);
  });
});


