/**
 * Copperhead packet framing - port of evilsocket Packet / CopperheadPacket
 * (GPL-3.0).
 */

import { PACKET_SIZE } from "./uuids.ts";

export type ProtocolLayer = "session" | "command";

let copperheadTag = 32;

function nextTag(): number {
  copperheadTag = (copperheadTag + 1) & 0xff;
  if (copperheadTag === 0xff) copperheadTag = 0;
  return copperheadTag;
}

export function resetCopperheadTag(seed = 32): void {
  copperheadTag = seed;
}

export class Packet {
  readonly buffer: Uint8Array;

  constructor(sizeOrBuffer: number | Uint8Array) {
    if (typeof sizeOrBuffer === "number") {
      this.buffer = new Uint8Array(sizeOrBuffer);
    } else {
      this.buffer = sizeOrBuffer;
    }
  }

  static wrapCopperhead(payload: Uint8Array): Packet {
    const packet = new Packet(payload.length + 1);
    packet.setPayload(payload);
    return packet;
  }

  getProtocolLayer(): ProtocolLayer {
    return (this.buffer[0]! & 0x80) !== 0 ? "session" : "command";
  }

  getPacketCount(): number {
    return this.buffer[0]! & 0x3;
  }

  getPacketIndex(): number {
    return (this.buffer[0]! >>> 2) & 0x3;
  }

  getSequenceNumber(): number {
    return (this.buffer[0]! >>> 4) & 0x7;
  }

  setProtocolLayer(layer: ProtocolLayer): void {
    if (layer === "session") {
      this.buffer[0]! |= 0x80;
    } else {
      this.buffer[0]! &= 0x7f;
    }
  }

  setSequenceNumber(n: number): void {
    this.buffer[0]! |= (n & 0x7) << 4;
  }

  setPacketIndex(n: number): void {
    this.buffer[0]! &= 0xf3;
    this.buffer[0]! |= (n & 0x3) << 2;
  }

  setPacketCount(n: number): void {
    this.buffer[0]! &= 0xfc;
    this.buffer[0]! |= n & 0x3;
  }

  setCommandBytes(a: number, b: number): void {
    this.buffer[1] = a & 0xff;
    this.buffer[2] = b & 0xff;
  }

  setPayload(payload: Uint8Array): void {
    this.buffer.set(payload, 1);
  }

  /** Bytes after the protocol header (little-endian view helpers). */
  payloadView(): DataView {
    return new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
  }
}

/** Build a fixed-size SESSION packet (auth handshake uses 19 bytes). */
export function buildSessionPacket(
  sequence: number,
  byte1: number,
  byte2: number,
  extra?: Uint8Array,
): Packet {
  const p = new Packet(PACKET_SIZE);
  p.setProtocolLayer("session");
  p.setPacketCount(0);
  p.setPacketIndex(0);
  p.setSequenceNumber(sequence);
  if (extra && extra.length > 0) {
    const payload = new Uint8Array(PACKET_SIZE - 1);
    payload[0] = byte1;
    payload[1] = byte2;
    payload.set(extra, 2);
    p.setPayload(payload);
  } else {
    p.setCommandBytes(byte1, byte2);
  }
  return p;
}

/**
 * Cmd_Settings_Get: Copperhead opcode 10, subtype 1, setting code.
 * Wrapped in a COMMAND-layer Packet.
 */
export function buildSettingsGetPacket(settingCode: number, sequence = 1): Packet {
  const copperhead = new Uint8Array(5);
  copperhead[0] = 4; // size field = length - 1
  copperhead[1] = nextTag();
  copperhead[2] = 10; // opcode Cmd_Settings_Get
  copperhead[3] = 1;
  copperhead[4] = settingCode & 0xff;

  const p = Packet.wrapCopperhead(copperhead);
  p.setProtocolLayer("command");
  p.setPacketCount(0);
  p.setPacketIndex(0);
  p.setSequenceNumber(sequence);
  return p;
}

export function buildAuthStartPacket(sequence = 1): Packet {
  return buildSessionPacket(sequence, 0x01, 0x01);
}

export function buildAuthResponsePacket(
  sequence: number,
  crcSum: number,
): Packet {
  const p = new Packet(PACKET_SIZE);
  p.setProtocolLayer("session");
  p.setPacketCount(0);
  p.setPacketIndex(0);
  p.setSequenceNumber(sequence);

  const payload = new Uint8Array(PACKET_SIZE - 1);
  payload[0] = 0x03;
  payload[1] = 0x02;
  // Big-endian short (Java ByteBuffer default)
  payload[2] = (crcSum >>> 8) & 0xff;
  payload[3] = crcSum & 0xff;
  p.setPayload(payload);
  return p;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
