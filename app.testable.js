/**
 * Extracted pure functions from app.js for testing.
 * These mirror the exact implementations in app.js.
 */

const FULL_POOL = 300.0;
const MIN_POWER_POOL = 288.0;
const FLOOD_POOL = 310.0;
const NO_DATA_SENTINEL = -999999;

const MONTH_AVG = {
  1: 296.8, 2: 298.2, 3: 299.5, 4: 300.8, 5: 301.2, 6: 300.5,
  7: 299.3, 8: 297.8, 9: 296.5, 10: 295.8, 11: 295.5, 12: 295.9
};

const LAST_YEAR_BY_MONTH = {
  1: 296.61, 2: 308.28, 3: 301.05, 4: 301.28, 5: 302.59, 6: 303.02,
  7: 303.31, 8: 299.93, 9: 297.32, 10: 297.21, 11: 296.08, 12: 295.13
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

// --- Exact copies of app.js functions ---

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

function fmtFt1(v) { return v.toFixed(1) + ' ft'; }

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function seasonFor(month) {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

function monthName(n) {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][n-1];
}

function computePoolBar(v) {
  const clampedV = Math.max(MIN_POWER_POOL, Math.min(FLOOD_POOL, v));
  return ((clampedV - MIN_POWER_POOL) / (FLOOD_POOL - MIN_POWER_POOL)) * 100;
}

function computeRampStatus(level, rampMin) {
  const margin = level - rampMin;
  if (margin >= 2) return { cls: 'good', label: 'Accessible' };
  if (margin > 0) return { cls: 'warn', label: `Marginal (+${margin.toFixed(1)} ft)` };
  return { cls: 'bad', label: `Below threshold (${margin.toFixed(1)} ft)` };
}

function computeDiff(v) {
  const diff = v - FULL_POOL;
  const absDiff = Math.abs(diff);
  if (absDiff < 0.05) return 'At full pool';
  if (diff < 0) return `${absDiff.toFixed(1)} ft below full pool`;
  return `${absDiff.toFixed(1)} ft above full pool`;
}

module.exports = {
  parseUSGS, fmtFt1, isoDate, seasonFor, monthName,
  computePoolBar, computeRampStatus, computeDiff,
  FULL_POOL, MIN_POWER_POOL, FLOOD_POOL, NO_DATA_SENTINEL,
  MONTH_AVG, LAST_YEAR_BY_MONTH, RAMPS
};
