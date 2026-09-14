const BAND_COLORS = { red: "#e5484d", yellow: "#f5a623", green: "#30a46c" };

export function bandColor(band) {
  return BAND_COLORS[band] || "#999999";
}

export function renderRecoveryCard(el, today) {
  if (!today || today.state === "no_data") {
    el.innerHTML = `<div class="empty">אין עדיין נתונים להיום. בדוק שהסנכרון מהשעון רץ.</div>`;
    return;
  }

  if (today.state === "calibrating") {
    el.innerHTML = `
      <div class="recovery-calibrating">
        <div class="recovery-title">בכיול</div>
        <div class="recovery-sub">${today.daysOfHistory}/14 ימי היסטוריה</div>
        <div class="recovery-hint">צריך עוד כמה ימי נתונים כדי לחשב ציון התאוששות אמין.</div>
      </div>`;
    return;
  }

  const color = bandColor(today.band);
  const provisional =
    today.state === "provisional" ? `<span class="badge">ראשוני (${today.daysOfHistory} ימים)</span>` : "";

  el.innerHTML = `
    <div class="recovery-score" style="--band-color:${color}">
      <div class="score-number">${today.score}</div>
      <div class="score-label">${today.label}</div>
      ${provisional}
    </div>`;
}
