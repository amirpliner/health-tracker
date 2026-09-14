// Cloudflare Worker: ingests Health Auto Export webhooks into D1 and serves
// a summary API (recovery score, sleep, HRV/RHR trend, workouts) to the dashboard.

const RAW_LOG_KEEP = 20;
const BASELINE_WINDOW_DAYS = 30;
const MIN_DAYS_FOR_SCORE = 7;
const MIN_DAYS_FOR_FULL_CONFIDENCE = 14;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, env) });
    }

    try {
      if (url.pathname === "/ingest/health-auto-export" && request.method === "POST") {
        return await handleIngest(request, env);
      }
      if (url.pathname === "/api/summary" && request.method === "GET") {
        return await handleSummary(request, env, url);
      }
    } catch (err) {
      return jsonResponse({ error: String(err && err.message || err) }, 500, request, env);
    }

    return jsonResponse({ error: "not found" }, 404, request, env);
  },
};

// ---------- Ingest ----------

async function handleIngest(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${env.INGEST_SECRET}`) {
    return jsonResponse({ error: "unauthorized" }, 401, request, env);
  }

  const rawBody = await request.text();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO raw_ingest_log (received_at, body) VALUES (?, ?)"
    ).bind(new Date().toISOString(), rawBody.slice(0, 200000)),
    env.DB.prepare(
      `DELETE FROM raw_ingest_log WHERE id NOT IN (
         SELECT id FROM raw_ingest_log ORDER BY id DESC LIMIT ${RAW_LOG_KEEP}
       )`
    ),
  ]);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid json" }, 400, request, env);
  }

  const metrics = payload?.data?.metrics || [];
  const workouts = payload?.data?.workouts || [];
  const now = new Date().toISOString();

  const dailyByDate = new Map(); // date -> {hrv_avg_ms, resting_hr_bpm, avg_hr_bpm, vo2max}
  const sleepByDate = new Map(); // date -> {asleep_hours, deep_hours, core_hours, rem_hours, awake_hours}

  const getDaily = (date) => {
    if (!dailyByDate.has(date)) dailyByDate.set(date, {});
    return dailyByDate.get(date);
  };
  const getSleep = (date) => {
    if (!sleepByDate.has(date)) sleepByDate.set(date, {});
    return sleepByDate.get(date);
  };

  for (const metric of metrics) {
    const name = metric?.name;
    const points = metric?.data || [];
    for (const point of points) {
      const date = dateOnly(point.date);
      if (!date) continue;

      if (name === "heart_rate_variability") {
        getDaily(date).hrv_avg_ms = pickNumber(point, ["qty", "Avg", "avg", "value"]);
      } else if (name === "resting_heart_rate") {
        getDaily(date).resting_hr_bpm = pickNumber(point, ["qty", "Avg", "avg", "value"]);
      } else if (name === "heart_rate") {
        getDaily(date).avg_hr_bpm = pickNumber(point, ["Avg", "avg", "qty", "value"]);
      } else if (name === "vo2_max" || name === "vo2max") {
        getDaily(date).vo2max = pickNumber(point, ["qty", "Avg", "avg", "value"]);
      } else if (name === "sleep_analysis") {
        const s = getSleep(date);
        s.asleep_hours = pickNumber(point, ["totalSleep", "asleep", "qty"]);
        s.deep_hours = pickNumber(point, ["deep", "deepSleep"]);
        s.core_hours = pickNumber(point, ["core", "coreSleep"]);
        s.rem_hours = pickNumber(point, ["rem", "remSleep"]);
        s.awake_hours = pickNumber(point, ["awake"]);
        s.in_bed_start = point.inBedStart || point.startDate || null;
        s.in_bed_end = point.inBedEnd || point.endDate || null;
        s.source = point.source || null;
      }
    }
  }

  const statements = [];

  for (const [date, d] of dailyByDate) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO daily_metrics (date, hrv_avg_ms, resting_hr_bpm, avg_hr_bpm, vo2max, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           hrv_avg_ms = COALESCE(excluded.hrv_avg_ms, daily_metrics.hrv_avg_ms),
           resting_hr_bpm = COALESCE(excluded.resting_hr_bpm, daily_metrics.resting_hr_bpm),
           avg_hr_bpm = COALESCE(excluded.avg_hr_bpm, daily_metrics.avg_hr_bpm),
           vo2max = COALESCE(excluded.vo2max, daily_metrics.vo2max),
           updated_at = excluded.updated_at`
      ).bind(date, d.hrv_avg_ms ?? null, d.resting_hr_bpm ?? null, d.avg_hr_bpm ?? null, d.vo2max ?? null, now)
    );
  }

  for (const [date, s] of sleepByDate) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO sleep_sessions (date, in_bed_start, in_bed_end, asleep_hours, deep_hours, core_hours, rem_hours, awake_hours, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           in_bed_start = COALESCE(excluded.in_bed_start, sleep_sessions.in_bed_start),
           in_bed_end = COALESCE(excluded.in_bed_end, sleep_sessions.in_bed_end),
           asleep_hours = COALESCE(excluded.asleep_hours, sleep_sessions.asleep_hours),
           deep_hours = COALESCE(excluded.deep_hours, sleep_sessions.deep_hours),
           core_hours = COALESCE(excluded.core_hours, sleep_sessions.core_hours),
           rem_hours = COALESCE(excluded.rem_hours, sleep_sessions.rem_hours),
           awake_hours = COALESCE(excluded.awake_hours, sleep_sessions.awake_hours),
           source = COALESCE(excluded.source, sleep_sessions.source),
           updated_at = excluded.updated_at`
      ).bind(date, s.in_bed_start ?? null, s.in_bed_end ?? null, s.asleep_hours ?? null, s.deep_hours ?? null, s.core_hours ?? null, s.rem_hours ?? null, s.awake_hours ?? null, s.source ?? null, now)
    );
  }

  for (const w of workouts) {
    const startTs = w.start || w.startDate || w.start_date;
    if (!startTs) continue;
    const workoutType = w.name || w.type || w.workoutType || "workout";
    const id = await sha256Hex(`${workoutType}|${startTs}`);
    statements.push(
      env.DB.prepare(
        `INSERT INTO workouts (id, workout_type, start_ts, end_ts, duration_min, active_energy_kcal, distance_km, avg_heart_rate, max_heart_rate, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           end_ts = excluded.end_ts,
           duration_min = excluded.duration_min,
           active_energy_kcal = excluded.active_energy_kcal,
           distance_km = excluded.distance_km,
           avg_heart_rate = excluded.avg_heart_rate,
           max_heart_rate = excluded.max_heart_rate,
           source = excluded.source,
           updated_at = excluded.updated_at`
      ).bind(
        id,
        workoutType,
        startTs,
        w.end || w.endDate || null,
        pickNumber(w, ["duration", "durationMinutes"]),
        pickNumber(w, ["activeEnergyBurned", "totalEnergyBurned", "activeEnergy"]),
        pickNumber(w, ["distance"]),
        pickNumber(w, ["avgHeartRate", "heartRateAvg"]),
        pickNumber(w, ["maxHeartRate", "heartRateMax"]),
        w.source || null,
        now
      )
    );
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return jsonResponse({ ok: true, daysUpdated: dailyByDate.size, sleepUpdated: sleepByDate.size, workoutsUpdated: workouts.length }, 200, request, env);
}

// ---------- Summary API ----------

async function handleSummary(request, env, url) {
  if (url.searchParams.get("key") !== env.READ_KEY) {
    return jsonResponse({ error: "unauthorized" }, 401, request, env);
  }

  const days = clamp(parseInt(url.searchParams.get("days") || "30", 10) || 30, 7, 60);
  const fetchDays = days + BASELINE_WINDOW_DAYS;

  const { results: dailyRows } = await env.DB.prepare(
    `SELECT date, hrv_avg_ms, resting_hr_bpm, avg_hr_bpm, vo2max FROM daily_metrics
     ORDER BY date DESC LIMIT ?`
  ).bind(fetchDays).all();
  dailyRows.reverse(); // ascending by date

  const todayStr = new Date().toISOString().slice(0, 10);

  const trendRows = dailyRows.filter((r) => isWithinLastNDays(r.date, todayStr, days));
  const recoveryTrend = trendRows.map((r) => ({ date: r.date, ...computeScoreForDate(r.date, dailyRows) }));

  const todayRow = dailyRows.find((r) => r.date === todayStr);
  const today = todayRow
    ? { date: todayStr, ...computeScoreForDate(todayStr, dailyRows) }
    : { date: todayStr, state: "no_data" };

  const { results: sleepRows } = await env.DB.prepare(
    `SELECT * FROM sleep_sessions ORDER BY date DESC LIMIT 14`
  ).all();
  sleepRows.reverse();

  const { results: workoutRows } = await env.DB.prepare(
    `SELECT * FROM workouts ORDER BY start_ts DESC LIMIT 14`
  ).all();

  const lastSyncedRow = await env.DB.prepare(
    `SELECT MAX(updated_at) as t FROM (
       SELECT updated_at FROM daily_metrics
       UNION ALL SELECT updated_at FROM sleep_sessions
       UNION ALL SELECT updated_at FROM workouts
     )`
  ).first();

  return jsonResponse(
    {
      lastSynced: lastSyncedRow?.t || null,
      today,
      recoveryTrend,
      hrvRhrTrend: trendRows.map((r) => ({ date: r.date, hrv: r.hrv_avg_ms, rhr: r.resting_hr_bpm })),
      sleep: {
        last: sleepRows.length ? sleepRows[sleepRows.length - 1] : null,
        trend: sleepRows,
      },
      workouts: workoutRows,
    },
    200,
    request,
    env
  );
}

function computeScoreForDate(dateStr, allRowsAsc) {
  const baseline = allRowsAsc
    .filter((r) => r.date < dateStr && r.hrv_avg_ms != null && r.resting_hr_bpm != null)
    .slice(-BASELINE_WINDOW_DAYS);

  if (baseline.length < MIN_DAYS_FOR_SCORE) {
    return { state: "calibrating", daysOfHistory: baseline.length };
  }

  const today = allRowsAsc.find((r) => r.date === dateStr);
  if (!today || today.hrv_avg_ms == null || today.resting_hr_bpm == null) {
    return { state: "no_data", daysOfHistory: baseline.length };
  }

  const hrvStats = meanStdev(baseline.map((r) => r.hrv_avg_ms));
  const rhrStats = meanStdev(baseline.map((r) => r.resting_hr_bpm));

  const zHrv = hrvStats.stdev < 1 ? 0 : (today.hrv_avg_ms - hrvStats.mean) / hrvStats.stdev;
  const zRhr = rhrStats.stdev < 1 ? 0 : (rhrStats.mean - today.resting_hr_bpm) / rhrStats.stdev;

  const score = clamp(Math.round(50 + 25 * zHrv + 25 * zRhr), 0, 100);
  const band = score < 34 ? "red" : score < 67 ? "yellow" : "green";
  const label = band === "red" ? "להתמקד בהתאוששות" : band === "yellow" ? "לשמור על קצב" : "מוכן לאימון";
  const state = baseline.length < MIN_DAYS_FOR_FULL_CONFIDENCE ? "provisional" : "full";

  return { state, score, band, label, daysOfHistory: baseline.length };
}

function meanStdev(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, stdev: Math.sqrt(variance) };
}

function isWithinLastNDays(dateStr, todayStr, n) {
  const d = new Date(dateStr + "T00:00:00Z").getTime();
  const t = new Date(todayStr + "T00:00:00Z").getTime();
  const diffDays = (t - d) / 86400000;
  return diffDays >= 0 && diffDays < n;
}

// ---------- Helpers ----------

function dateOnly(v) {
  if (!v || typeof v !== "string") return null;
  return v.slice(0, 10);
}

function pickNumber(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request, env),
    },
  });
}
