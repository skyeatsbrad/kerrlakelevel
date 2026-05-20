#!/usr/bin/env node
/**
 * Fetches last year's Kerr Lake elevation (20th of each month)
 * from USGS and updates the LAST_YEAR_BY_MONTH object in app.js.
 *
 * Run: node scripts/update-last-year.js
 * Called monthly by GitHub Actions.
 */

const fs = require('fs');
const path = require('path');

const USGS_SITE = '02079490';
const USGS_PARAM = '62614';
const APP_JS = path.join(__dirname, '..', 'app.js');

async function fetchMonth(year, month) {
  const mm = String(month).padStart(2, '0');
  const start = `${year}-${mm}-19`;
  const end = `${year}-${mm}-20`;
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${USGS_SITE}&parameterCd=${USGS_PARAM}&startDT=${start}&endDT=${end}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for month ${month}`);
  const json = await res.json();

  const values = json?.value?.timeSeries?.[0]?.values?.[0]?.value;
  if (!values || values.length === 0) return null;

  // Find reading closest to noon on the 20th
  const target = new Date(`${year}-${mm}-20T12:00:00`).getTime();
  let best = values[0];
  let bestDist = Math.abs(new Date(values[0].dateTime).getTime() - target);
  for (const v of values) {
    const dist = Math.abs(new Date(v.dateTime).getTime() - target);
    if (dist < bestDist) { bestDist = dist; best = v; }
  }

  const val = parseFloat(best.value);
  return Number.isFinite(val) && val > 0 ? val : null;
}

async function main() {
  const lastYear = new Date().getFullYear() - 1;
  console.log(`Fetching ${lastYear} data from USGS...`);

  const results = {};
  for (let m = 1; m <= 12; m++) {
    try {
      const val = await fetchMonth(lastYear, m);
      if (val != null) {
        results[m] = parseFloat(val.toFixed(2));
        console.log(`  Month ${m}: ${results[m]} ft`);
      } else {
        console.log(`  Month ${m}: no data`);
      }
    } catch (err) {
      console.error(`  Month ${m}: ${err.message}`);
    }
  }

  if (Object.keys(results).length < 6) {
    console.error('Too few months returned — aborting update to avoid bad data.');
    process.exit(1);
  }

  // Build replacement line
  const entries = [];
  for (let m = 1; m <= 12; m++) {
    entries.push(`${m}: ${results[m] ?? 'null'}`);
    if (m === 6) entries.push('\n    '); // line break after June
  }
  const newObj = `  const LAST_YEAR_BY_MONTH = {\n    ${entries.slice(0, 6).join(', ')},\n    ${entries.slice(7).join(', ')}\n  };`;

  // Read app.js and replace the object
  let code = fs.readFileSync(APP_JS, 'utf8');
  const regex = /  const LAST_YEAR_BY_MONTH = \{[^}]+\};/;
  if (!regex.test(code)) {
    console.error('Could not find LAST_YEAR_BY_MONTH in app.js');
    process.exit(1);
  }

  code = code.replace(regex, newObj);
  fs.writeFileSync(APP_JS, code, 'utf8');
  console.log(`\nUpdated app.js with ${lastYear} data (${Object.keys(results).length} months).`);
}

main();
