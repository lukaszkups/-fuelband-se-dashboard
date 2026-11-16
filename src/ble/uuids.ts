/** Copperhead GATT UUIDs for Nike+ FuelBand SE */

export const COPPERHEAD_SERVICE =
  "83cdc410-31dd-11e2-81c1-0800200c9a66";

export const COPPERHEAD_CMD =
  "c7d25540-31dd-11e2-81c1-0800200c9a66";

export const COPPERHEAD_RSP =
  "d36f33f0-31dd-11e2-81c1-0800200c9a66";

/** Nike company identifier in BLE advertisement manufacturer data */
export const NIKE_COMPANY_CODE = new Uint8Array([0, 120]);

/** Hardcoded auth token used by the official app (all 0xFF) */
export const AUTH_TOKEN = new Uint8Array(16).fill(0xff);

export const PACKET_SIZE = 19;
