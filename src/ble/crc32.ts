/**
 * CopperheadCRC32 - port of evilsocket/nikeplus-fuelband-se-reversed
 * (GPL-3.0). Polynomial 0x04C11DB7; input length must be a multiple of 4.
 */

const CRCPOLY = 0x04c11db7;
const INITIAL = 0xffffffff;

export class CopperheadCRC32 {
  private value = INITIAL;

  getValue(): number {
    return this.value >>> 0;
  }

  reset(): void {
    this.value = INITIAL;
  }

  update(data: Uint8Array): void {
    if (data.length % 4 !== 0) {
      throw new Error("Length of data must be a multiple of 4");
    }

    let m = this.value >>> 0;
    for (let i = 0; i < data.length; i++) {
      m ^= (data[i ^ 0x3]! & 0xff) << 24;
      m >>>= 0;
      for (let j = 0; j < 8; j++) {
        if (m & 0x80000000) {
          m = (CRCPOLY ^ ((m << 1) >>> 0)) >>> 0;
        } else {
          m = (m << 1) >>> 0;
        }
      }
    }
    this.value = m;
  }
}

/** Truncated CRC used in FuelBand SE authentication challenge response. */
export function authChallengeSum(nonce: Uint8Array, token: Uint8Array): number {
  const crc = new CopperheadCRC32();
  crc.update(nonce);
  crc.update(token);
  const v = crc.getValue();
  return (0xffff & v) ^ (0xffff & (v >>> 16));
}
