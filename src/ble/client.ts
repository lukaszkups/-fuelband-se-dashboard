/**
 * Web Bluetooth client for Nike+ FuelBand SE (Copperhead protocol).
 * Read-only: auth + Cmd_Settings_Get. No reset/bootloader/writes.
 */

import { authChallengeSum } from "./crc32.ts";
import {
  buildAuthResponsePacket,
  buildAuthStartPacket,
  buildSettingsGetPacket,
  bytesToHex,
  Packet,
} from "./packet.ts";
import {
  DASHBOARD_SETTINGS,
  parseSettingsResponse,
  SETTING_CODES,
  type SettingName,
  type SettingValue,
} from "./settings.ts";
import {
  AUTH_TOKEN,
  COPPERHEAD_CMD,
  COPPERHEAD_RSP,
  COPPERHEAD_SERVICE,
} from "./uuids.ts";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "ready"
  | "error";

export interface BandSnapshot {
  fuel: number | null;
  steps: number | null;
  calories: number | null;
  tempGoal: number | null;
  lifetimeFuel: number | null;
  serial: string | null;
  firstName: string | null;
  syncedAt: Date | null;
  raw: Partial<Record<SettingName, SettingValue>>;
}

export type StatusListener = (state: ConnectionState, detail?: string) => void;

const emptySnapshot = (): BandSnapshot => ({
  fuel: null,
  steps: null,
  calories: null,
  tempGoal: null,
  lifetimeFuel: null,
  serial: null,
  firstName: null,
  syncedAt: null,
  raw: {},
});

function asNumber(v: SettingValue | undefined): number | null {
  return typeof v === "number" ? v : null;
}

function asString(v: SettingValue | undefined): string | null {
  return typeof v === "string" ? v : null;
}

export class FuelBandClient {
  private device: BluetoothDevice | null = null;
  private cmd: BluetoothRemoteGATTCharacteristic | null = null;
  private rsp: BluetoothRemoteGATTCharacteristic | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pendingResponse: {
    resolve: (p: Packet) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private state: ConnectionState = "disconnected";
  private onStatus: StatusListener | null = null;
  private snapshot: BandSnapshot = emptySnapshot();

  setStatusListener(listener: StatusListener | null): void {
    this.onStatus = listener;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getSnapshot(): BandSnapshot {
    return this.snapshot;
  }

  private setState(state: ConnectionState, detail?: string): void {
    this.state = state;
    this.onStatus?.(state, detail);
  }

  isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.bluetooth;
  }

  async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error(
        "Web Bluetooth is not available. Use Chrome or Edge on Linux/desktop.",
      );
    }

    this.setState("connecting", "Pick your FuelBand SE in the browser dialog");

    // acceptAllDevices: SE often omits a stable name / service UUID in ads
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [COPPERHEAD_SERVICE],
    });

    this.device = device;
    device.addEventListener("gattserverdisconnected", () => {
      this.cleanupGatt();
      this.setState("disconnected", "Band disconnected");
    });

    const server = await device.gatt!.connect();

    const service = await server.getPrimaryService(COPPERHEAD_SERVICE);
    this.cmd = await service.getCharacteristic(COPPERHEAD_CMD);
    this.rsp = await service.getCharacteristic(COPPERHEAD_RSP);

    await this.rsp.startNotifications();
    this.rsp.addEventListener(
      "characteristicvaluechanged",
      this.onNotify as EventListener,
    );

    this.setState("authenticating", "Authenticating with Copperhead…");
    await this.authenticate();
    this.setState("ready", device.name ?? "FuelBand SE");
  }

  async disconnect(): Promise<void> {
    try {
      this.device?.gatt?.disconnect();
    } finally {
      this.cleanupGatt();
      this.setState("disconnected");
    }
  }

  async refresh(): Promise<BandSnapshot> {
    if (this.state !== "ready" || !this.cmd) {
      throw new Error("Not connected");
    }

    const raw: Partial<Record<SettingName, SettingValue>> = {};

    for (const name of DASHBOARD_SETTINGS) {
      const code = SETTING_CODES[name];
      try {
        const values = await this.getSetting(code);
        for (const parsed of values) {
          if (parsed.name.startsWith("UNKNOWN_")) continue;
          raw[parsed.name as SettingName] = parsed.value;
        }
      } catch (err) {
        console.warn(`Failed to read ${name}`, err);
      }
    }

    this.snapshot = {
      fuel: asNumber(raw.FUEL),
      steps: asNumber(raw.STEPS),
      calories: asNumber(raw.CALORIES),
      tempGoal: asNumber(raw.TEMP_GOAL),
      lifetimeFuel: asNumber(raw.LIFETIME_FUEL),
      serial: asString(raw.SERIAL_NUMBER),
      firstName: asString(raw.FIRST_NAME),
      syncedAt: new Date(),
      raw,
    };

    return this.snapshot;
  }

  private cleanupGatt(): void {
    if (this.rsp) {
      this.rsp.removeEventListener(
        "characteristicvaluechanged",
        this.onNotify as EventListener,
      );
    }
    if (this.pendingResponse) {
      clearTimeout(this.pendingResponse.timer);
      this.pendingResponse.reject(new Error("Disconnected"));
      this.pendingResponse = null;
    }
    this.cmd = null;
    this.rsp = null;
    this.device = null;
  }

  private onNotify = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value || !this.pendingResponse) return;

    const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    const packet = new Packet(bytes);
    clearTimeout(this.pendingResponse.timer);
    const { resolve } = this.pendingResponse;
    this.pendingResponse = null;
    resolve(packet);
  };

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private writeAndWait(data: Uint8Array, timeoutMs = 8000): Promise<Packet> {
    return this.enqueue(async () => {
      if (!this.cmd) throw new Error("No command characteristic");

      const response = new Promise<Packet>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingResponse = null;
          reject(new Error("Timed out waiting for band response"));
        }, timeoutMs);
        this.pendingResponse = { resolve, reject, timer };
      });

      const copy = new Uint8Array(data);
      await this.cmd.writeValue(copy);
      return response;
    });
  }

  private async authenticate(): Promise<void> {
    const challenge = await this.writeAndWait(buildAuthStartPacket(1).buffer);
    const buf = challenge.buffer;

    if (buf.length < 19) {
      throw new Error(`Short auth challenge (${buf.length} bytes)`);
    }

    // protocol, length, opcode 0x41, then 16-byte nonce
    const authOpcode = buf[2];
    if (authOpcode !== 0x41) {
      throw new Error(
        `Unexpected auth opcode 0x${(authOpcode ?? 0).toString(16)} (expected 0x41)`,
      );
    }

    const nonce = buf.slice(3, 19);
    if (nonce.length !== 16) {
      throw new Error("Missing or invalid authentication challenge nonce");
    }

    console.debug("Auth nonce:", bytesToHex(nonce));

    const sum = authChallengeSum(nonce, AUTH_TOKEN);
    const seq = challenge.getSequenceNumber() + 1;
    const reply = await this.writeAndWait(
      buildAuthResponsePacket(seq, sum).buffer,
    );

    const replyCode = reply.buffer[2];
    if (replyCode !== 0x42) {
      throw new Error(
        `Authentication failure, reply: 0x${(replyCode ?? 0).toString(16)}`,
      );
    }
  }

  private async getSetting(code: number) {
    const response = await this.writeAndWait(
      buildSettingsGetPacket(code, 1).buffer,
    );
    return parseSettingsResponse(response.buffer);
  }
}
