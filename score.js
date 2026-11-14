/* score.js — modelo "¿cuándo salir?" compartido por la app (index.html) y los avisos (sw.js) */
(function (G) {
  "use strict";
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // Peso de la época del año en el Campo de Gibraltar (ene..dic)
  const SEASON = [0.9, 0.75, 0.8, 0.8, 0.55, 0.3, 0.15, 0.15, 0.55, 1, 1, 1];

  // Lluvia caída hace k días: cuánto cuenta hoy (salen 7–16 días después)
  function lagCurve(k) {
    if (k <= 2) return 0.15; if (k <= 5) return 0.45; if (k <= 7) return 0.8;
    if (k <= 16) return 1; if (k <= 22) return 0.7; if (k <= 30) return 0.35; return 0;
  }
  function tempFactor(t) {
    if (t < 3) return 0.2; if (t < 7) return 0.5; if (t < 10) return 0.8; if (t <= 20) return 1;
    if (t <= 23) return 0.7; if (t <= 26) return 0.4; return 0.15;
  }
  function isLevante(dir, spd) { return dir != null && spd != null && dir >= 45 && dir <= 135 && spd >= 30; }
  function soilFactor(sm) { if (sm == null) return 1; if (sm < 0.12) return 0.65; if (sm < 0.18) return 0.85; return 1; }

  /* Convierte la respuesta de Open-Meteo en arrays diarios */
  function buildData(j, label) {
    const d = j.daily;
    const D = {
      time: d.time, p: d.precipitation_sum, tmax: d.temperature_2m_max, tmin: d.temperature_2m_min,
      wspd: d.wind_speed_10m_max, wdir: d.wind_direction_10m_dominant, et0: d.et0_fao_evapotranspiration || [],
      sunrise: d.sunrise || [], sunset: d.sunset || [], wcode: d.weather_code || [], soil: null, label: label || ""
    };
    if (j.hourly && j.hourly.soil_moisture_3_to_9cm) {
      const map = {}, ht = j.hourly.time, hv = j.hourly.soil_moisture_3_to_9cm;
      for (let k = 0; k < ht.length; k++) {
        const day = ht[k].slice(0, 10), v = hv[k];
        if (v == null) continue;
        (map[day] = map[day] || []).push(v);
      }
      D.soil = D.time.map(t => map[t] ? map[t].reduce((a, b) => a + b, 0) / map[t].length : null);
    }
    return D;
  }

  function common(D, i) {
    let tsum = 0, tn = 0;
    for (let j = Math.max(0, i - 4); j <= i; j++) if (D.tmax[j] != null) { tsum += (D.tmax[j] + D.tmin[j]) / 2; tn++; }
    const tmean = tn ? tsum / tn : 15;
    let frost = 0, lev = 0, et = 0;
    for (let j = Math.max(0, i - 3); j <= i; j++) {
      if (D.tmin[j] != null && D.tmin[j] < 1) frost++;
      if (isLevante(D.wdir[j], D.wspd[j])) lev++;
      et += D.et0[j] || 0;
    }
    const ff = Math.pow(0.78, frost);
    let df = 1 - 0.12 * lev; if (et > 14) df *= 0.85; df = clamp(df, 0.4, 1);
    const sm = D.soil ? D.soil[i] : null;
    const month = new Date(D.time[i] + "T12:00:00").getMonth();
    return { tmean, frost, lev, et, ff, df, sm, month };
  }

  /* Índice general 0–100 para el día i */
  function scoreDay(D, i) {
    let S = 0;
    for (let k = 1; k <= 30; k++) { const j = i - k; if (j >= 0) S += (D.p[j] || 0) * lagCurve(k); }
    const water = 1 - Math.exp(-S / 30);
    const c = common(D, i);
    const tf = tempFactor(c.tmean);
    const sf = Math.sqrt(SEASON[c.month]);
    const soil = soilFactor(c.sm);
    const score = Math.round(100 * water * tf * c.ff * c.df * sf * soil);
    let lastBig = null;
    for (let j = i; j >= Math.max(0, i - 40); j--) if ((D.p[j] || 0) >= 10) { lastBig = j; break; }
    let r20 = 0; for (let j = Math.max(0, i - 20); j < i; j++) r20 += D.p[j] || 0;
    return Object.assign({ score, water, S, tf, sf, soil, lastBig, r20 }, c);
  }

  /* Reglas por especie: días tras la lluvia en que suele salir [desde, hasta] y temperatura media que prefiere */
  const RULES = {
    tentullo: { lag: [10, 18], t: [10, 20] }, reticulado: { lag: [8, 15], t: [14, 24] },
    tana: { lag: [6, 13], t: [14, 24] }, gallipierno: { lag: [5, 12], t: [10, 22] },
    niscalo: { lag: [10, 18], t: [8, 18] }, rebozuelo: { lag: [10, 20], t: [7, 18] },
    trompeta: { lag: [12, 22], t: [6, 15] }, lengua: { lag: [10, 20], t: [7, 17] },
    cardo: { lag: [7, 14], t: [10, 20] }, champi: { lag: [5, 10], t: [10, 22] },
    pieazul: { lag: [12, 22], t: [5, 14] }, barbuda: { lag: [4, 9], t: [8, 20] },
    higado: { lag: [8, 16], t: [12, 22] }, criadilla: { lag: [15, 30], t: [9, 18] },
    phalloides: { lag: [8, 15], t: [11, 22] }, verna: { lag: [8, 15], t: [10, 20] },
    lepiotas: { lag: [6, 12], t: [10, 22] }, galerina: { lag: [10, 20], t: [6, 16] },
    cortinarius: { lag: [10, 18], t: [10, 20] }, pantherina: { lag: [8, 15], t: [10, 22] },
    muscaria: { lag: [10, 18], t: [8, 18] }, satanas: { lag: [6, 12], t: [16, 26] },
    omphalotus: { lag: [6, 14], t: [12, 24] }, entoloma: { lag: [8, 15], t: [10, 20] },
    hypholoma: { lag: [8, 20], t: [5, 18] }
  };
  function winCurve(k, a, b) {
    if (k < a - 4) return 0.1; if (k < a) return 0.55; if (k <= b) return 1; if (k <= b + 6) return 0.6; if (k <= 30) return 0.25; return 0;
  }
  function speciesChance(id, months, D, i) {
    const r = RULES[id]; if (!r) return 0;
    let S = 0;
    for (let k = 1; k <= 30; k++) { const j = i - k; if (j >= 0) S += (D.p[j] || 0) * winCurve(k, r.lag[0], r.lag[1]); }
    const water = 1 - Math.exp(-S / 30);
    const c = common(D, i);
    const t = c.tmean, lo = r.t[0], hi = r.t[1];
    const tf = (t >= lo && t <= hi) ? 1 : (t >= lo - 3 && t <= hi + 3) ? 0.55 : 0.15;
    const m = c.month + 1, prev = m === 1 ? 12 : m - 1, next = m === 12 ? 1 : m + 1;
    const mf = months.includes(m) ? 1 : (months.includes(prev) || months.includes(next)) ? 0.35 : 0.03;
    return Math.round(100 * water * tf * mf * c.ff * c.df * soilFactor(c.sm));
  }

  function todayIndex(D, now) {
    const t = now || new Date();
    const iso = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
    let i = D.time.indexOf(iso);
    if (i < 0) i = Math.min(31, D.time.length - 1);
    return i;
  }
  function bestAhead(D, i0, n) {
    let best = -1, bestI = i0; const list = [];
    for (let k = 0; k < (n || 8) && i0 + k < D.time.length; k++) {
      const s = scoreDay(D, i0 + k).score; list.push([i0 + k, s]);
      if (s > best) { best = s; bestI = i0 + k; }
    }
    return { best, bestI, list };
  }

  function weatherURL(lat, lon, withSoil) {
    return "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
      "&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant,et0_fao_evapotranspiration,sunrise,sunset,weather_code" +
      (withSoil ? "&hourly=soil_moisture_3_to_9cm" : "") +
      "&past_days=31&forecast_days=8&timezone=Europe%2FMadrid";
  }

  G.SetasModel = { SEASON, lagCurve, tempFactor, isLevante, buildData, scoreDay, speciesChance, RULES, todayIndex, bestAhead, weatherURL, clamp };
})(typeof self !== "undefined" ? self : this);
