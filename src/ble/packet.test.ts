import { describe, expect, it } from "vitest";
import {
  buildAuthResponsePacket,
  buildAuthStartPacket,
  buildSettingsGetPacket,
  bytesToHex,
  resetCopperheadTag,
} from "./packet.ts";
import { parseSettingsResponse, SETTING_CODES } from "./settings.ts";

describe("packet framing", () => {
  it("builds SESSION auth start 0x90 0x01 0x01…", () => {
    const p = buildAuthStartPacket(1);
    expect(p.buffer.length).toBe(19);
    expect(p.buffer[0]).toBe(0x90);
    expect(p.buffer[1]).toBe(0x01);
    expect(p.buffer[2]).toBe(0x01);
    expect(p.getProtocolLayer()).toBe("session");
    expect(p.getSequenceNumber()).toBe(1);
  });

  it("builds auth response with big-endian CRC short", () => {
    const p = buildAuthResponsePacket(5, 0x09d8);
    expect(p.buffer[0]).toBe(0xd0); // session + seq 5
    expect(p.buffer[1]).toBe(0x03);
    expect(p.buffer[2]).toBe(0x02);
    expect(p.buffer[3]).toBe(0x09);
    expect(p.buffer[4]).toBe(0xd8);
  });

  it("builds Cmd_Settings_Get for FUEL", () => {
    resetCopperheadTag(32);
    const p = buildSettingsGetPacket(SETTING_CODES.FUEL, 1);
    expect(p.getProtocolLayer()).toBe("command");
    // [hdr][size=4][tag][opcode=10][1][code=48]
    expect(p.buffer[1]).toBe(4);
    expect(p.buffer[3]).toBe(10);
    expect(p.buffer[4]).toBe(1);
    expect(p.buffer[5]).toBe(48);
  });
});

describe("parseSettingsResponse", () => {
  it("parses a FUEL uint32 setting", () => {
    // protocol, size, tag, opcode, elements=1, key=48, size=4, value BE 0x00000BB8 (3000)
    const raw = Uint8Array.from([
      0x00, 0x0a, 0x21, 0x0a, 0x01, 0x30, 0x04, 0x00, 0x00, 0x0b, 0xb8,
    ]);
    const parsed = parseSettingsResponse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.name).toBe("FUEL");
    expect(parsed[0]!.value).toBe(3000);
  });

  it("parses a SERIAL_NUMBER string", () => {
    const serial = new TextEncoder().encode("ABC123\0\0");
    const raw = new Uint8Array(4 + 1 + 2 + serial.length);
    raw[0] = 0x00;
    raw[1] = 0x10;
    raw[2] = 0x22;
    raw[3] = 0x0a;
    raw[4] = 1; // elements
    raw[5] = 0; // SERIAL_NUMBER
    raw[6] = serial.length;
    raw.set(serial, 7);
    const parsed = parseSettingsResponse(raw);
    expect(parsed[0]!.name).toBe("SERIAL_NUMBER");
    expect(parsed[0]!.value).toBe("ABC123");
  });
});

describe("bytesToHex", () => {
  it("formats bytes", () => {
    expect(bytesToHex(Uint8Array.from([0x0f, 0xa0]))).toBe("0fa0");
  });
});
