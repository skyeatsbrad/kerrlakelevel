/* ===========================================================
   Kerr Lake Level — app.js
   Data: USGS Station 02079490 + Open-Meteo (Clarksville, VA)
   =========================================================== */

(() => {
  'use strict';

  // ---------- Config ----------
  const USGS_SITE = '02079490';
  const USGS_PARAM = '62614';            // Reservoir elevation, NGVD29
  const FULL_POOL = 300.0;
  const MIN_POWER_POOL = 288.0;
  const FLOOD_POOL = 310.0;
  const NO_DATA_SENTINEL = -999999;
  const REFRESH_MS = 15 * 60 * 1000;     // 15 minutes
  const ET_TZ = 'America/New_York';

  const MONTH_AVG = {
    1: 296.8, 2: 298.2, 3: 299.5, 4: 300.8, 5: 301.2, 6: 300.5,
    7: 299.3, 8: 297.8, 9: 296.5, 10: 295.8, 11: 295.5, 12: 295.9
  };

  // Last year's elevation by month (20th of each month, 2025 — updated annually)
  const LAST_YEAR_BY_MONTH = {
    1: 296.61, 2: 308.28, 3: 301.05, 4: 301.28, 5: 302.59, 6: 303.02,
    7: 303.31, 8: 299.93, 9: 297.32, 10: 297.21, 11: 296.08, 12: 295.13
  };

  const SEASONAL_NOTES = {
    spring: 'Spring fill season — lake typically rises through May.',
    summer: 'Summer recreation season — expect gradual drawdown through fall.',
    fall: 'Fall drawdown — lake levels typically reach annual low in October.',
    winter: 'Winter refill — lake recovering from fall lows.'
  };

  const RAMPS = [
    { name: 'Occoneechee State Park', min: 295, note: 'Multi-lane, maintained' },
    { name: 'Staunton River (Staunton View)', min: 296, note: '' },
    { name: 'Buffalo Park', min: 294, note: '' },
    { name: 'North Bend Park', min: 295, note: '' },
    { name: 'Longwood Park', min: 296, note: 'Can get shallow' },
    { name: 'Clarksville Marina', min: 297, note: 'Courtesy dock, shallow approach' },
    { name: 'Palmer Point', min: 293, note: 'Deep water access' },
    { name: 'Nutbush Creek', min: 295, note: '' },
    { name: 'Flemingtown', min: 294, note: '' },
    { name: 'County Line', min: 296, note: '' }
  ];

  const WX_CODE = {
    0:  { icon: '☀️', label: 'Clear' },
    1:  { icon: '🌤️', label: 'Mostly clear' },
    2:  { icon: '⛅', label: 'Partly cloudy' },
    3:  { icon: '☁️', label: 'Overcast' },
    45: { icon: '🌫️', label: 'Fog' },
    48: { icon: '🌫️', label: 'Rime fog' },
    51: { icon: '🌦️', label: 'Drizzle' },
    53: { icon: '🌦️', label: 'Drizzle' },
    55: { icon: '🌦️', label: 'Drizzle' },
    61: { icon: '🌧️', label: 'Rain' },
    63: { icon: '🌧️', label: 'Rain' },
    65: { icon: '🌧️', label: 'Heavy rain' },
    71: { icon: '🌨️', label: 'Snow' },
    73: { icon: '🌨️', label: 'Snow' },
    75: { icon: '❄️', label: 'Heavy snow' },
    77: { icon: '🌨️', label: 'Snow grains' },
    80: { icon: '🌦️', label: 'Showers' },
    81: { icon: '🌧️', label: 'Showers' },
    82: { icon: '⛈️', label: 'Heavy showers' },
    85: { icon: '🌨️', label: 'Snow showers' },
    86: { icon: '🌨️', label: 'Snow showers' },
    95: { icon: '⛈️', label: 'Thunderstorm' },
    96: { icon: '⛈️', label: 'Thunderstorm + hail' },
    99: { icon: '⛈️', label: 'Severe storm' }
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const bigNumber = $('bigNumber');
  const diffEl = $('diffFromFull');
  const trendEl = $('trend');
  const statusEl = $('statusMessage');
  const updatedEl = $('updatedAt');
  const provBadge = $('provisionalBadge');
  const lastYearVal = $('lastYearValue');
  const lastYearDelta = $('lastYearDelta');
  const monthAvgVal = $('monthAvgValue');
  const monthAvgDelta = $('monthAvgDelta');
  const monthNameEl = $('monthName');
  const seasonalNoteEl = $('seasonalNote');
  const rampListEl = $('rampList');
  const weatherEl = $('weather');
  const yearEl = $('year');
  const refreshBtn = $('refreshBtn');
  const poolFill = $('poolBarFill');
  const poolMarker = $('poolBarMarker');
  const chartLoading = $('chartLoading');

  yearEl.textContent = new Date().getFullYear();

  // ---------- State ----------
  let chartInstance = null;
  let lastFetchTime = null;

  // ---------- Helpers ----------
  const fmtFt = (v) => (v == null || Number.isNaN(v)) ? '—' : `${v.toFixed(2)} ft`;
  const fmtFt1 = (v) => (v == null || Number.isNaN(v)) ? '—' : `${v.toFixed(1)} ft`;

  function relativeTime(date) {
    const secs = Math.round((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    const days = Math.round(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function fmtETTime(d) {
    return d.toLocaleString('en-US', {
      timeZone: ET_TZ,
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true
    }) + ' ET';
  }

  function monthName(n) {
    return ['January','February','March','April','May','June','July','August','September','October','November','December'][n-1];
  }

  function seasonFor(month) {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
  }

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function fetchJSON(url, { timeoutMs = 15000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        cache: 'no-store',
        mode: 'cors',
        credentials: 'omit'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // Pull all data points from USGS JSON. Returns array of { time: Date, value: number, qualifiers: [] }.
  function parseUSGS(json) {
    const ts = json?.value?.timeSeries?.[0];
    if (!ts) return [];
    const values = ts.values?.[0]?.value || [];
    return values
      .map(v => ({
        time: new Date(v.dateTime),
        value: parseFloat(v.value),
        qualifiers: v.qualifiers || []
      }))
      .filter(p => Number.isFinite(p.value) && p.value !== NO_DATA_SENTINEL && p.value > 0);
  }

  // ---------- Render: hero ----------
  function renderHero(latest, history7d) {
    if (!latest) {
      bigNumber.textContent = 'Data unavailable';
      diffEl.textContent = 'Try refreshing in a few minutes.';
      statusEl.textContent = 'Could not reach USGS. The station may be temporarily offline.';
      statusEl.className = 'status-message bad';
      return;
    }

    const v = latest.value;
    bigNumber.innerHTML = `${v.toFixed(1)}<span style="font-size:.5em;color:var(--text-muted);"> ft</span>`;

    // Diff from full pool
    const diff = v - FULL_POOL;
    const absDiff = Math.abs(diff);
    if (absDiff < 0.05) {
      diffEl.innerHTML = `<strong>At full pool</strong>`;
    } else if (diff < 0) {
      diffEl.innerHTML = `<strong>${absDiff.toFixed(1)} ft</strong> below full pool`;
    } else {
      diffEl.innerHTML = `<strong>${absDiff.toFixed(1)} ft</strong> above full pool`;
    }

    // Provisional badge
    if (latest.qualifiers && latest.qualifiers.includes('P')) {
      provBadge.classList.remove('hidden');
    } else {
      provBadge.classList.add('hidden');
    }

    // Trend — compare against ~24h ago from history7d
    let trendRate = null;
    if (history7d && history7d.length > 1) {
      const target = latest.time.getTime() - 24 * 3600 * 1000;
      let best = history7d[0];
      let bestDiff = Math.abs(history7d[0].time.getTime() - target);
      for (const p of history7d) {
        const d = Math.abs(p.time.getTime() - target);
        if (d < bestDiff) { bestDiff = d; best = p; }
      }
      const hoursApart = (latest.time.getTime() - best.time.getTime()) / 3600000;
      if (hoursApart > 0) {
        const deltaFt = latest.value - best.value;
        trendRate = deltaFt * (24 / hoursApart); // ft/day
      }
    }

    if (trendRate == null) {
      trendEl.querySelector('.trend-icon').textContent = '➡️';
      trendEl.querySelector('.trend-text').textContent = 'Trend unavailable';
    } else {
      let icon = '➡️', label = 'Stable';
      if (trendRate > 0.05) { icon = '📈'; label = 'Rising'; }
      else if (trendRate < -0.05) { icon = '📉'; label = 'Falling'; }
      const rateStr = `${trendRate >= 0 ? '+' : ''}${trendRate.toFixed(2)} ft/day`;
      trendEl.querySelector('.trend-icon').textContent = icon;
      trendEl.querySelector('.trend-text').textContent = `${label} · ${rateStr}`;
    }

    // Status message
    let msg, cls;
    if (v >= FULL_POOL - 0.5) {
      msg = 'Lake is near full pool — all ramps should be accessible.';
      cls = 'good';
    } else if (v >= 298) {
      msg = 'Lake is slightly below full pool — conditions are normal for most ramps.';
      cls = 'good';
    } else if (v >= 296) {
      msg = 'Lake is moderately low — some shallow ramps may be limited.';
      cls = 'warn';
    } else if (v >= 293) {
      msg = 'Lake is significantly below normal — check ramp conditions before launching.';
      cls = 'warn';
    } else {
      msg = 'Lake level is very low — many ramps may be unusable. Verify locally before launching.';
      cls = 'bad';
    }
    if (v >= FLOOD_POOL - 2) {
      msg = 'Lake is approaching flood pool — expect debris, strong currents, and possible ramp closures.';
      cls = 'bad';
    }
    statusEl.textContent = msg;
    statusEl.className = `status-message ${cls}`;

    // Updated timestamp
    updatedEl.textContent = `Updated ${relativeTime(latest.time)} (${fmtETTime(latest.time)})`;

    // Pool bar position
    const clampedV = Math.max(MIN_POWER_POOL, Math.min(FLOOD_POOL, v));
    const pct = ((clampedV - MIN_POWER_POOL) / (FLOOD_POOL - MIN_POWER_POOL)) * 100;
    poolFill.style.width = `${pct}%`;
    poolMarker.style.left = `${pct}%`;
  }

  // ---------- Render: comparisons & seasonal ----------
  function renderComparisons(latest, lastYearLatest) {
    const now = new Date();
    const month = now.getMonth() + 1;
    monthNameEl.textContent = monthName(month);

    const avg = MONTH_AVG[month];
    monthAvgVal.textContent = fmtFt1(avg);
    if (latest) {
      const d = latest.value - avg;
      const sign = d >= 0 ? '+' : '−';
      monthAvgDelta.textContent = `${sign}${Math.abs(d).toFixed(1)} ft vs current`;
      monthAvgDelta.className = 'compare-delta ' + (d >= 0 ? 'up' : 'down');
    }

    if (lastYearLatest) {
      lastYearVal.textContent = fmtFt1(lastYearLatest.value);
      if (latest) {
        const d = latest.value - lastYearLatest.value;
        const arrow = d >= 0 ? '▲' : '▼';
        const sign = d >= 0 ? '+' : '−';
        lastYearDelta.textContent = `${arrow} ${sign}${Math.abs(d).toFixed(1)} ft vs current`;
        lastYearDelta.className = 'compare-delta ' + (d >= 0 ? 'up' : 'down');
      }
    } else {
      lastYearVal.textContent = 'Unavailable';
      lastYearDelta.textContent = '';
    }

    seasonalNoteEl.textContent = SEASONAL_NOTES[seasonFor(month)];
  }

  // ---------- Render: ramps ----------
  function renderRamps(latest) {
    rampListEl.innerHTML = '';
    if (!latest) return;
    const v = latest.value;
    const sorted = [...RAMPS].sort((a, b) => b.min - a.min);

    for (const r of sorted) {
      const margin = v - r.min;
      let cls, label;
      if (margin >= 2) { cls = 'good'; label = 'Accessible'; }
      else if (margin > 0) { cls = 'warn'; label = `Marginal (+${margin.toFixed(1)} ft)`; }
      else { cls = 'bad'; label = `Below threshold (${margin.toFixed(1)} ft)`; }

      const li = document.createElement('li');
      li.className = 'ramp-item';
      li.innerHTML = `
        <div>
          <div class="ramp-name">${r.name}</div>
          <div class="ramp-min">Min usable ~${r.min} ft${r.note ? ' · ' + r.note : ''}</div>
        </div>
        <span class="ramp-status ${cls}">${label}</span>
      `;
      rampListEl.appendChild(li);
    }
  }

  // ---------- Render: chart ----------
  function renderChart(history30d) {
    if (!window.Chart) {
      // Chart.js still loading — retry
      setTimeout(() => renderChart(history30d), 300);
      return;
    }
    if (!history30d || history30d.length === 0) {
      chartLoading.textContent = 'Chart data unavailable.';
      return;
    }
    chartLoading.style.display = 'none';

    // Downsample to ~120 points max for performance
    const max = 160;
    let data = history30d;
    if (data.length > max) {
      const step = Math.ceil(data.length / max);
      data = data.filter((_, i) => i % step === 0);
    }

    const labels = data.map(p => p.time);
    const values = data.map(p => p.value);

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.15)';
    const accent = isDark ? '#06b6d4' : '#0369a1';
    const fillTop = isDark ? 'rgba(6,182,212,.35)' : 'rgba(3,105,161,.25)';
    const fillBottom = isDark ? 'rgba(6,182,212,0)' : 'rgba(3,105,161,0)';

    const ctx = document.getElementById('chart30').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, fillTop);
    gradient.addColorStop(1, fillBottom);

    if (chartInstance) chartInstance.destroy();

    // Compute y-axis range with breathing room around full pool
    const vmin = Math.min(...values, FULL_POOL) - 0.5;
    const vmax = Math.max(...values, FULL_POOL) + 0.5;

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Elevation (ft)',
            data: values,
            borderColor: accent,
            borderWidth: 2,
            fill: true,
            backgroundColor: gradient,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25
          },
          {
            label: 'Full pool (300 ft)',
            data: values.map(() => FULL_POOL),
            borderColor: isDark ? 'rgba(248,250,252,.4)' : 'rgba(15,23,42,.35)',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day', tooltipFormat: 'MMM d, h:mm a', displayFormats: { day: 'MMM d' } },
            grid: { color: gridColor, drawTicks: false },
            ticks: { color: textColor, maxRotation: 0, autoSkipPadding: 18 }
          },
          y: {
            min: vmin,
            max: vmax,
            grid: { color: gridColor },
            ticks: { color: textColor, callback: (v) => `${v} ft` }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#f8fafc' : '#0f172a',
            borderColor: gridColor,
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y.toFixed(2)} ft`
            }
          }
        }
      }
    });
  }

  // Adapter: Chart.js time scale needs a date adapter. Provide a tiny inline one.
  // (Avoid extra dependency; implement minimal adapter for "day"/tooltip.)
  function installDateAdapter() {
    if (!window.Chart || !Chart._adapters) return;
    const adapter = {
      _id: 'mini',
      formats: () => ({}),
      parse: (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime()),
      format: (ts, fmt) => {
        const d = new Date(ts);
        if (fmt === 'MMM d') {
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        if (fmt === 'MMM d, h:mm a') {
          return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        }
        return d.toISOString();
      },
      add: (ts, amount, unit) => {
        const d = new Date(ts);
        if (unit === 'day') d.setDate(d.getDate() + amount);
        else if (unit === 'hour') d.setHours(d.getHours() + amount);
        else if (unit === 'month') d.setMonth(d.getMonth() + amount);
        else if (unit === 'year') d.setFullYear(d.getFullYear() + amount);
        return d.getTime();
      },
      diff: (a, b, unit) => {
        const ms = a - b;
        if (unit === 'day') return ms / 86400000;
        if (unit === 'hour') return ms / 3600000;
        return ms;
      },
      startOf: (ts, unit) => {
        const d = new Date(ts);
        if (unit === 'day') { d.setHours(0,0,0,0); }
        if (unit === 'hour') { d.setMinutes(0,0,0); }
        return d.getTime();
      },
      endOf: (ts, unit) => {
        const d = new Date(ts);
        if (unit === 'day') { d.setHours(23,59,59,999); }
        return d.getTime();
      }
    };
    Chart._adapters._date.override(adapter);
  }

  // ---------- Weather ----------
  async function loadWeather() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=36.6246&longitude=-78.5578' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode' +
      '&temperature_unit=fahrenheit&timezone=America/New_York&forecast_days=7';
    try {
      const data = await fetchJSON(url);
      renderWeather(data);
    } catch (err) {
      weatherEl.innerHTML = '<div class="weather-loading">Forecast unavailable.</div>';
      console.warn('Weather fetch failed', err);
    }
  }

  function renderWeather(data) {
    const days = data?.daily?.time || [];
    if (!days.length) {
      weatherEl.innerHTML = '<div class="weather-loading">Forecast unavailable.</div>';
      return;
    }
    const hi = data.daily.temperature_2m_max;
    const lo = data.daily.temperature_2m_min;
    const pop = data.daily.precipitation_probability_max;
    const codes = data.daily.weathercode;

    weatherEl.innerHTML = '';
    for (let i = 0; i < days.length; i++) {
      const d = new Date(days[i] + 'T12:00:00');
      const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
      const c = WX_CODE[codes[i]] || { icon: '🌡️', label: '' };
      const rain = pop[i] ?? 0;
      const rainy = rain >= 50;

      const el = document.createElement('div');
      el.className = 'wx-day' + (rainy ? ' rainy' : '');
      el.innerHTML = `
        <div class="wx-dow">${i === 0 ? 'Today' : dow}</div>
        <div class="wx-icon" title="${c.label}">${c.icon}</div>
        <div class="wx-hi">${Math.round(hi[i])}°</div>
        <div class="wx-lo">${Math.round(lo[i])}°</div>
        <div class="wx-rain">${rain}%</div>
      `;
      weatherEl.appendChild(el);
    }
  }

  // ---------- Main load ----------
  async function loadAll() {
    refreshBtn.classList.add('spinning');
    try {
      const baseURL = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${USGS_SITE}&parameterCd=${USGS_PARAM}`;

      const [current, hist7, hist30] = await Promise.allSettled([
        fetchJSON(`${baseURL}`),
        fetchJSON(`${baseURL}&period=P7D`),
        fetchJSON(`${baseURL}&period=P30D`)
      ]);

      const curArr = current.status === 'fulfilled' ? parseUSGS(current.value) : [];
      const h7 = hist7.status === 'fulfilled' ? parseUSGS(hist7.value) : [];
      const h30 = hist30.status === 'fulfilled' ? parseUSGS(hist30.value) : [];

      // Latest reading: prefer the dedicated "current" endpoint; fall back to last 7-day point
      let latest = curArr[curArr.length - 1] || h7[h7.length - 1] || null;

      // Last year's value from embedded lookup (no cross-year API call needed)
      const thisMonth = new Date().getMonth() + 1;
      const lyValue = LAST_YEAR_BY_MONTH[thisMonth];
      const lastYearLatest = lyValue != null ? { value: lyValue, time: new Date() } : null;

      renderHero(latest, h7);
      renderComparisons(latest, lastYearLatest);
      renderRamps(latest);
      renderChart(h30);

      lastFetchTime = Date.now();
    } catch (err) {
      console.error('loadAll failed', err);
      if (!bigNumber.textContent || bigNumber.textContent.includes('—')) {
        bigNumber.textContent = 'Data unavailable';
        statusEl.textContent = 'Unable to fetch data — try refreshing.';
        statusEl.className = 'status-message bad';
      }
    } finally {
      refreshBtn.classList.remove('spinning');
    }
  }

  // ---------- Events ----------
  refreshBtn.addEventListener('click', loadAll);

  // Refresh "X minutes ago" label every 30s using cached latest reading
  setInterval(() => {
    if (!lastFetchTime) return;
    // We rerender from cached state by re-pulling DOM-friendly time — simplest is a full reload
    // every 15 min, but the relative label looks stale otherwise. So we leave the timestamp,
    // and only the next loadAll updates it. This keeps the code simple.
  }, 30000);

  // Auto-refresh every 15 minutes
  setInterval(loadAll, REFRESH_MS);

  // Reload when tab becomes visible after >5 min away
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && lastFetchTime && (Date.now() - lastFetchTime) > 5 * 60 * 1000) {
      loadAll();
    }
  });

  // ---------- Boot ----------
  function boot() {
    // Wait briefly for Chart.js to register, then install the lightweight date adapter
    const waitChart = () => {
      if (window.Chart) {
        try { installDateAdapter(); } catch (e) { console.warn('adapter install failed', e); }
        return;
      }
      setTimeout(waitChart, 50);
    };
    waitChart();

    loadAll();
    loadWeather();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
