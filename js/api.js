import { CONFIG } from "./config.js";

export async function fetchSummary(days = CONFIG.DAYS) {
  const url = `${CONFIG.API_BASE}/api/summary?days=${days}&key=${encodeURIComponent(CONFIG.READ_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
