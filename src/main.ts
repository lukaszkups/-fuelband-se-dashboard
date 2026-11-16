import "./style.css";
import { FuelBandClient } from "./ble/client.ts";
import { mountDashboard } from "./ui/dashboard.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app missing");
}

mountDashboard(app, new FuelBandClient());
