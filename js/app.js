import { fetchSummary } from "./api.js";
import { renderRecoveryCard } from "./recovery.js";
import { renderRecoveryTrendChart, renderSleepTrendChart, renderHrvRhrChart } from "./charts.js";

function formatLastSynced(iso) {
  if (!iso) return "לא סונכרן עדיין";
  return new Date(iso).toLocaleString("he-IL");
}

function renderSleepCard(el, last) {
  if (!last) {
    el.innerHTML = `<div class="empty">אין נתוני שינה עדיין</div>`;
    return;
  }
  el.innerHTML = `
    <div class="sleep-total">${fmt(last.asleep_hours)} שעות שינה</div>
    <div class="sleep-stages">
      <span>עמוקה: ${fmt(last.deep_hours)}</span>
      <span>רגילה: ${fmt(last.core_hours)}</span>
      <span>REM: ${fmt(last.rem_hours)}</span>
    </div>`;
}

function renderWorkoutsTable(el, workouts) {
  if (!workouts.length) {
    el.innerHTML = `<div class="empty">אין אימונים עדיין</div>`;
    return;
  }
  const rows = workouts
    .map(
      (w) => `
    <tr>
      <td>${new Date(w.start_ts).toLocaleDateString("he-IL")}</td>
      <td>${w.workout_type}</td>
      <td>${w.duration_min ? Math.round(w.duration_min) + " דק'" : "-"}</td>
      <td>${w.active_energy_kcal ? Math.round(w.active_energy_kcal) + " קק\"ל" : "-"}</td>
      <td>${w.avg_heart_rate ? Math.round(w.avg_heart_rate) : "-"}</td>
    </tr>`
    )
    .join("");
  el.innerHTML = `
    <table>
      <thead><tr><th>תאריך</th><th>סוג</th><th>משך</th><th>קלוריות</th><th>דופק ממוצע</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function fmt(n) {
  return typeof n === "number" ? n.toFixed(1) : "-";
}

async function main() {
  const statusEl = document.getElementById("last-synced");
  try {
    const summary = await fetchSummary();
    statusEl.textContent = `סונכרן לאחרונה: ${formatLastSynced(summary.lastSynced)}`;
    renderRecoveryCard(document.getElementById("recovery-card"), summary.today);
    renderRecoveryTrendChart(document.getElementById("recovery-trend-chart"), summary.recoveryTrend);
    renderSleepCard(document.getElementById("sleep-card"), summary.sleep.last);
    renderSleepTrendChart(document.getElementById("sleep-trend-chart"), summary.sleep.trend);
    renderHrvRhrChart(document.getElementById("hrv-rhr-chart"), summary.hrvRhrTrend);
    renderWorkoutsTable(document.getElementById("workouts-table"), summary.workouts);
  } catch (err) {
    statusEl.textContent = `שגיאה בטעינת נתונים: ${err.message}`;
  }
}

main();
