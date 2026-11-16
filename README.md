# SE Readout

Local **Web Bluetooth** dashboard for the abandoned **Nike+ FuelBand SE**. Read-only: Fuel, steps, calories, goal, lifetime fuel, serial, and name. No Nike cloud.

Protocol logic is a TypeScript port of [evilsocket/nikeplus-fuelband-se-reversed](https://github.com/evilsocket/nikeplus-fuelband-se-reversed) (GPL-3.0). Authentication uses the hardcoded `0xFF…` token documented in that work.

## Requirements

- Linux (or another desktop OS with BLE)
- **Chrome** or **Edge** (Web Bluetooth; Firefox/Safari will not work)
- A Nike+ FuelBand SE in range
- Bluetooth adapter enabled

## Quick start

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL in Chrome/Edge. Wake the band (press its button), click **Connect**, pick the device, then wait for auth and the first refresh.

## Scripts

| Command        | What it does                          |
|----------------|----------------------------------------|
| `npm run dev`  | Vite dev server                        |
| `npm run build`| Typecheck + production build           |
| `npm run test` | Unit tests (CRC32, packets, settings)  |
| `npm run preview` | Preview production build            |

## Live band checklist

1. Bluetooth on; band charged enough to advertise.
2. Press the band button so it wakes / advertises.
3. Chrome: allow Bluetooth when prompted.
4. Status should go Connecting → Authenticating → Connected.
5. Fuel / Steps / Calories should populate; use **Refresh** to poll again.

If the picker is empty, try again after waking the band. Some systems need the user in the `lp` / bluetooth group, or BlueZ experimental features for LE.

## Project layout

- `src/ble/` - Copperhead UUIDs, CRC32, packet framing, settings parser, Web Bluetooth client
- `src/ui/` - dashboard UI
- `src/ble/*.test.ts` - protocol fixtures (no hardware required)

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
