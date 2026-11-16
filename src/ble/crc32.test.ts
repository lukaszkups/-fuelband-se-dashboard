import { describe, expect, it } from "vitest";
import { authChallengeSum, CopperheadCRC32 } from "./crc32.ts";
import { AUTH_TOKEN } from "./uuids.ts";

describe("CopperheadCRC32", () => {
  it("rejects lengths that are not a multiple of 4", () => {
    const crc = new CopperheadCRC32();
    expect(() => crc.update(new Uint8Array([1, 2, 3]))).toThrow(
      /multiple of 4/,
    );
  });

  it("is deterministic for a fixed block", () => {
    const crc = new CopperheadCRC32();
    crc.update(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    expect(crc.getValue()).toBe(0xede062e3);
  });

  it("matches a second update after reset", () => {
    const a = new CopperheadCRC32();
    a.update(new Uint8Array(16).fill(0xff));
    const first = a.getValue();

    a.reset();
    a.update(new Uint8Array(16).fill(0xff));
    expect(a.getValue()).toBe(first);
  });

  it("computes auth challenge sum for blog-style nonce + FF token", () => {
    // Nonce from evilsocket blog example (hex)
    const nonce = Uint8Array.from(
      "F495C98693075322225EB8B8A4D79B39"
        .match(/.{2}/g)!
        .map((h) => parseInt(h, 16)),
    );
    const sum = authChallengeSum(nonce, AUTH_TOKEN);
    expect(sum).toBeGreaterThanOrEqual(0);
    expect(sum).toBeLessThanOrEqual(0xffff);
    // Stable fixture for regressions
    expect(sum).toBe(0x09d8);
  });
});
