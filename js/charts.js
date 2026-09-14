import { bandColor } from "./recovery.js";

export function renderRecoveryTrendChart(canvas, recoveryTrend) {
  const labels = recoveryTrend.map((d) => d.date.slice(5));
  const scores = recoveryTrend.map((d) =>
    d.state === "full" || d.state === "provisional" ? d.score : null
  );
  const pointColors = recoveryTrend.map((d) => bandColor(d.band));

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "ציון התאוששות",
          data: scores,
          borderColor: "#8888aa",
          pointBackgroundColor: pointColors,
          pointRadius: 4,
          spanGaps: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      scales: { y: { min: 0, max: 100 } },
      plugins: { legend: { display: false } },
    },
  });
}

export function renderSleepTrendChart(canvas, sleepTrend) {
  const labels = sleepTrend.map((d) => d.date.slice(5));
  const stage = (key, color, label) => ({
    label,
    backgroundColor: color,
    data: sleepTrend.map((d) => d[key] ?? 0),
    stack: "sleep",
  });

  new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        stage("deep_hours", "#2f7d5c", "עמוקה"),
        stage("core_hours", "#5b8fc7", "רגילה"),
        stage("rem_hours", "#a86bc7", "REM"),
        stage("awake_hours", "#d8d8d8", "ער"),
      ],
    },
    options: {
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  });
}

export function renderHrvRhrChart(canvas, hrvRhrTrend) {
  const labels = hrvRhrTrend.map((d) => d.date.slice(5));

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "HRV (ms)", data: hrvRhrTrend.map((d) => d.hrv), borderColor: "#5b8fc7", yAxisID: "y" },
        { label: "דופק מנוחה (bpm)", data: hrvRhrTrend.map((d) => d.rhr), borderColor: "#d9776b", yAxisID: "y1" },
      ],
    },
    options: {
      scales: {
        y: { type: "linear", position: "left" },
        y1: { type: "linear", position: "right", grid: { drawOnChartArea: false } },
      },
    },
  });
}
