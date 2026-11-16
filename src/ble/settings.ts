/**
 * FuelBand SE setting codes and response parser - port of evilsocket Utils
 * (GPL-3.0).
 */

export const SETTING_CODES = {
  SERIAL_NUMBER: 0,
  BAND_COLOR: 1,
  BLE_ADDRESS: 2,
  GOAL_0: 40,
  GOAL_1: 41,
  GOAL_2: 42,
  GOAL_3: 43,
  GOAL_4: 44,
  GOAL_5: 45,
  GOAL_6: 46,
  TEMP_GOAL: 47,
  FUEL: 48,
  CALORIES: 49,
  STEPS: 50,
  HOURSWON: 90,
  LIFETIME_FUEL: 94,
  FIRST_NAME: 97,
} as const;

export type SettingName = keyof typeof SETTING_CODES;

export type SettingType =
  | "boolean"
  | "byte"
  | "byteArray"
  | "string"
  | "uint16"
  | "uint32";

const CODE_TO_NAME = new Map<number, SettingName>(
  (Object.entries(SETTING_CODES) as [SettingName, number][]).map(
    ([name, code]) => [code, name],
  ),
);

export function settingNameForCode(code: number): SettingName | undefined {
  return CODE_TO_NAME.get(code);
}

export function getSettingType(code: number): SettingType {
  switch (code) {
    case 0:
    case 97:
      return "string";
    case 3:
    case 4:
    case 65:
    case 62:
    case 70:
      return "byte";
    case 2:
    case 8:
    case 9:
    case 10:
    case 75:
      return "byteArray";
    case 56:
    case 57:
    case 58:
    case 59:
    case 60:
    case 89:
    case 99:
      return "boolean";
    case 61:
      return "uint16";
    default:
      return "uint32";
  }
}

export type SettingValue = string | number | boolean | Uint8Array;

export interface ParsedSetting {
  code: number;
  name: SettingName | `UNKNOWN_${number}`;
  value: SettingValue;
}

function readAscii(bytes: Uint8Array): string {
  let end = 0;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return new TextDecoder("ascii").decode(bytes.subarray(0, end));
}

/**
 * Parse a Cmd_Settings_Get response packet buffer (including protocol byte).
 */
export function parseSettingsResponse(raw: Uint8Array): ParsedSetting[] {
  if (raw.length < 5) return [];

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let offset = 4; // skip protocol + copperhead size + tag + opcode
  const elements = view.getUint8(offset);
  offset += 1;

  if (elements <= 0) return [];

  const results: ParsedSetting[] = [];

  for (let i = 0; i < elements; i++) {
    if (raw.length - offset < 2) {
      throw new Error("Decoding error, not enough remaining bytes");
    }

    const configKey = view.getUint8(offset);
    offset += 1;
    let valueSize = view.getUint8(offset);
    offset += 1;
    valueSize = Math.min(valueSize, raw.length - offset);

    const name = settingNameForCode(configKey) ?? (`UNKNOWN_${configKey}` as const);
    const type = getSettingType(configKey);

    if (settingNameForCode(configKey) == null) {
      offset += valueSize;
      continue;
    }

    switch (type) {
      case "byte": {
        results.push({ code: configKey, name, value: view.getUint8(offset) });
        offset += 1;
        break;
      }
      case "byteArray": {
        const arr = raw.slice(offset, offset + valueSize);
        results.push({ code: configKey, name, value: arr });
        offset += valueSize;
        break;
      }
      case "string": {
        const arr = raw.slice(offset, offset + valueSize);
        results.push({ code: configKey, name, value: readAscii(arr) });
        offset += valueSize;
        break;
      }
      case "uint32": {
        // Java ByteBuffer default is BIG_ENDIAN for getInt in processGetSettingsResponse
        // but Copperhead payload buffer is LITTLE_ENDIAN. The PoC wraps the full
        // packet without setting order on ByteBuffer.wrap(raw), so BIG_ENDIAN.
        results.push({ code: configKey, name, value: view.getUint32(offset) });
        offset += 4;
        break;
      }
      case "uint16": {
        results.push({ code: configKey, name, value: view.getUint16(offset) });
        offset += 2;
        break;
      }
      case "boolean": {
        results.push({
          code: configKey,
          name,
          value: view.getUint8(offset) !== 0,
        });
        offset += 1;
        break;
      }
      default:
        offset += valueSize;
    }
  }

  return results;
}

/** Metrics we fetch on each dashboard refresh. */
export const DASHBOARD_SETTINGS: SettingName[] = [
  "FUEL",
  "STEPS",
  "CALORIES",
  "TEMP_GOAL",
  "LIFETIME_FUEL",
  "SERIAL_NUMBER",
  "FIRST_NAME",
];
