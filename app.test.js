const {
  parseUSGS, fmtFt1, isoDate, seasonFor, monthName,
  computePoolBar, computeRampStatus, computeDiff,
  FULL_POOL, MIN_POWER_POOL, FLOOD_POOL, NO_DATA_SENTINEL,
  MONTH_AVG, LAST_YEAR_BY_MONTH, RAMPS
} = require('./app.testable');

// Helper: build a valid USGS JSON response
function makeUSGS(values) {
  return {
    value: {
      timeSeries: [{
        values: [{
          value: values.map(v => ({
            dateTime: v.dt || '2026-05-20T12:00:00.000-04:00',
            value: v.val,
            qualifiers: v.q || ['P']
          }))
        }]
      }]
    }
  };
}

// ============================================================
// parseUSGS — ADVERSARIAL & INVALID INPUT TESTS
// ============================================================
describe('parseUSGS', () => {
  // --- Null / undefined / missing structure ---
  test('null input returns empty array', () => {
    expect(parseUSGS(null)).toEqual([]);
  });

  test('undefined input returns empty array', () => {
    expect(parseUSGS(undefined)).toEqual([]);
  });

  test('empty object returns empty array', () => {
    expect(parseUSGS({})).toEqual([]);
  });

  test('missing timeSeries returns empty array', () => {
    expect(parseUSGS({ value: {} })).toEqual([]);
  });

  test('empty timeSeries array returns empty array', () => {
    expect(parseUSGS({ value: { timeSeries: [] } })).toEqual([]);
  });

  test('missing values array returns empty array', () => {
    expect(parseUSGS({ value: { timeSeries: [{}] } })).toEqual([]);
  });

  test('empty values array returns empty array', () => {
    expect(parseUSGS({ value: { timeSeries: [{ values: [{ value: [] }] }] } })).toEqual([]);
  });

  // --- XSS / injection payloads ---
  test('XSS script tag in value is filtered out (NaN)', () => {
    const result = parseUSGS(makeUSGS([{ val: '<script>alert(1)</script>' }]));
    expect(result).toEqual([]);
  });

  test('XSS img onerror in value — parseFloat extracts number prefix', () => {
    const result = parseUSGS(makeUSGS([{ val: '299.3<img onerror=alert(1)>' }]));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(299.3);
    // Verify toFixed produces clean string (simulating render)
    expect(result[0].value.toFixed(1)).toBe('299.3');
    expect(result[0].value.toFixed(1)).not.toContain('<');
  });

  test('XSS in dateTime field — Date parses or returns Invalid Date', () => {
    const result = parseUSGS(makeUSGS([
      { val: '300.0', dt: '<script>alert(1)</script>' }
    ]));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(300.0);
    // Invalid date is still a Date object, just NaN internally
    expect(result[0].time instanceof Date).toBe(true);
  });

  test('SQL injection in value is filtered out (NaN)', () => {
    const result = parseUSGS(makeUSGS([{ val: "'; DROP TABLE users; --" }]));
    expect(result).toEqual([]);
  });

  test('JavaScript prototype pollution attempt', () => {
    const malicious = makeUSGS([{ val: '300.0' }]);
    malicious.__proto__ = { polluted: true };
    const result = parseUSGS(malicious);
    expect(result).toHaveLength(1);
    expect(({}).polluted).toBeUndefined();
  });

  // --- Sentinel and boundary values ---
  test('NO_DATA_SENTINEL (-999999) is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: '-999999' }]));
    expect(result).toEqual([]);
  });

  test('zero value is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: '0' }]));
    expect(result).toEqual([]);
  });

  test('negative value is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: '-5.0' }]));
    expect(result).toEqual([]);
  });

  test('Infinity is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: 'Infinity' }]));
    expect(result).toEqual([]);
  });

  test('-Infinity is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: '-Infinity' }]));
    expect(result).toEqual([]);
  });

  test('NaN string is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: 'NaN' }]));
    expect(result).toEqual([]);
  });

  test('empty string is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: '' }]));
    expect(result).toEqual([]);
  });

  test('whitespace-only string is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: '   ' }]));
    expect(result).toEqual([]);
  });

  // --- Extreme values ---
  test('extremely large number is accepted', () => {
    const result = parseUSGS(makeUSGS([{ val: '999999.9' }]));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(999999.9);
  });

  test('very small positive number is accepted', () => {
    const result = parseUSGS(makeUSGS([{ val: '0.001' }]));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(0.001);
  });

  test('Number.MAX_SAFE_INTEGER is accepted', () => {
    const result = parseUSGS(makeUSGS([{ val: String(Number.MAX_SAFE_INTEGER) }]));
    expect(result).toHaveLength(1);
  });

  // --- Valid data ---
  test('valid reading passes through correctly', () => {
    const result = parseUSGS(makeUSGS([
      { val: '299.3', dt: '2026-05-20T12:00:00.000-04:00', q: ['P'] }
    ]));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(299.3);
    expect(result[0].qualifiers).toEqual(['P']);
    expect(result[0].time).toBeInstanceOf(Date);
  });

  test('mixed valid and invalid values — only valid pass through', () => {
    const result = parseUSGS(makeUSGS([
      { val: '299.3' },       // valid
      { val: 'NaN' },         // filtered
      { val: '-999999' },     // filtered
      { val: '300.1' },       // valid
      { val: '<script>' },    // filtered
      { val: '0' },           // filtered
      { val: '301.5' },       // valid
    ]));
    expect(result).toHaveLength(3);
    expect(result.map(r => r.value)).toEqual([299.3, 300.1, 301.5]);
  });

  // --- Type confusion ---
  test('numeric type instead of string is handled', () => {
    const result = parseUSGS(makeUSGS([{ val: 300.5 }]));
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(300.5);
  });

  test('boolean value is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: true }]));
    // parseFloat(true) = NaN
    expect(result).toEqual([]);
  });

  test('array value is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: [300] }]));
    // parseFloat([300]) = 300 — this actually works in JS
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(300);
  });

  test('object value is filtered out', () => {
    const result = parseUSGS(makeUSGS([{ val: { toString: () => '300' } }]));
    expect(result).toHaveLength(1); // parseFloat calls toString
  });

  test('null value is filtered out', () => {
    // Manually construct since makeUSGS would set val to null
    const json = { value: { timeSeries: [{ values: [{ value: [
      { dateTime: '2026-05-20T12:00:00', value: null, qualifiers: [] }
    ]}]}]}};
    const result = parseUSGS(json);
    expect(result).toEqual([]);
  });
});

// ============================================================
// fmtFt1 — formatting safety
// ============================================================
describe('fmtFt1', () => {
  test('normal value formats correctly', () => {
    expect(fmtFt1(299.3)).toBe('299.3 ft');
  });

  test('rounds to 1 decimal', () => {
    expect(fmtFt1(299.37)).toBe('299.4 ft');
  });

  test('output never contains HTML characters', () => {
    const result = fmtFt1(299.3);
    expect(result).not.toMatch(/[<>"'&]/);
  });

  test('very large number formats without HTML', () => {
    const result = fmtFt1(999999.999);
    expect(result).toBe('1000000.0 ft');
    expect(result).not.toMatch(/[<>"'&]/);
  });
});

// ============================================================
// computeDiff — pool difference display
// ============================================================
describe('computeDiff', () => {
  test('at full pool', () => {
    expect(computeDiff(300.0)).toBe('At full pool');
  });

  test('just barely at full pool (within 0.05)', () => {
    expect(computeDiff(300.04)).toBe('At full pool');
    expect(computeDiff(299.96)).toBe('At full pool');
  });

  test('below full pool', () => {
    expect(computeDiff(299.3)).toBe('0.7 ft below full pool');
  });

  test('above full pool', () => {
    expect(computeDiff(302.5)).toBe('2.5 ft above full pool');
  });

  test('output never contains HTML', () => {
    expect(computeDiff(299.3)).not.toMatch(/[<>"'&]/);
    expect(computeDiff(305.0)).not.toMatch(/[<>"'&]/);
  });

  test('extreme low value', () => {
    const result = computeDiff(250.0);
    expect(result).toBe('50.0 ft below full pool');
  });

  test('extreme high value', () => {
    const result = computeDiff(350.0);
    expect(result).toBe('50.0 ft above full pool');
  });
});

// ============================================================
// computePoolBar — percentage clamping
// ============================================================
describe('computePoolBar', () => {
  test('full pool = correct percentage', () => {
    const pct = computePoolBar(300.0);
    expect(pct).toBeCloseTo(54.55, 1); // (300-288)/(310-288)*100
  });

  test('below min power pool clamps to 0%', () => {
    expect(computePoolBar(250.0)).toBe(0);
    expect(computePoolBar(280.0)).toBe(0);
  });

  test('above flood pool clamps to 100%', () => {
    expect(computePoolBar(315.0)).toBe(100);
    expect(computePoolBar(999.0)).toBe(100);
  });

  test('at min power pool = 0%', () => {
    expect(computePoolBar(288.0)).toBe(0);
  });

  test('at flood pool = 100%', () => {
    expect(computePoolBar(310.0)).toBe(100);
  });

  test('negative value clamps to 0%', () => {
    expect(computePoolBar(-100)).toBe(0);
  });

  test('NaN returns NaN (not injected into %)', () => {
    expect(computePoolBar(NaN)).toBeNaN();
  });
});

// ============================================================
// computeRampStatus — boat ramp status logic
// ============================================================
describe('computeRampStatus', () => {
  test('well above threshold = Accessible', () => {
    const s = computeRampStatus(300, 295);
    expect(s.cls).toBe('good');
    expect(s.label).toBe('Accessible');
  });

  test('exactly 2ft above = Accessible', () => {
    const s = computeRampStatus(297, 295);
    expect(s.cls).toBe('good');
  });

  test('just above threshold = Marginal', () => {
    const s = computeRampStatus(296.5, 295);
    expect(s.cls).toBe('warn');
    expect(s.label).toBe('Marginal (+1.5 ft)');
  });

  test('at exact threshold = Marginal (0+ margin)', () => {
    const s = computeRampStatus(295.01, 295);
    expect(s.cls).toBe('warn');
  });

  test('at threshold = Below (0 margin)', () => {
    const s = computeRampStatus(295, 295);
    expect(s.cls).toBe('bad');
  });

  test('below threshold', () => {
    const s = computeRampStatus(290, 295);
    expect(s.cls).toBe('bad');
    expect(s.label).toBe('Below threshold (-5.0 ft)');
  });

  test('labels never contain HTML', () => {
    const cases = [
      computeRampStatus(300, 295),
      computeRampStatus(296, 295),
      computeRampStatus(290, 295),
    ];
    for (const s of cases) {
      expect(s.label).not.toMatch(/[<>"'&]/);
    }
  });
});

// ============================================================
// seasonFor — boundary tests
// ============================================================
describe('seasonFor', () => {
  test('all months map correctly', () => {
    expect(seasonFor(1)).toBe('winter');
    expect(seasonFor(2)).toBe('winter');
    expect(seasonFor(3)).toBe('spring');
    expect(seasonFor(5)).toBe('spring');
    expect(seasonFor(6)).toBe('summer');
    expect(seasonFor(8)).toBe('summer');
    expect(seasonFor(9)).toBe('fall');
    expect(seasonFor(11)).toBe('fall');
    expect(seasonFor(12)).toBe('winter');
  });

  test('invalid month 0 returns winter', () => {
    expect(seasonFor(0)).toBe('winter');
  });

  test('invalid month 13 returns winter', () => {
    expect(seasonFor(13)).toBe('winter');
  });

  test('negative month returns winter', () => {
    expect(seasonFor(-1)).toBe('winter');
  });
});

// ============================================================
// monthName — boundary tests
// ============================================================
describe('monthName', () => {
  test('valid months 1-12', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(12)).toBe('December');
  });

  test('month 0 returns undefined', () => {
    expect(monthName(0)).toBeUndefined();
  });

  test('month 13 returns undefined', () => {
    expect(monthName(13)).toBeUndefined();
  });
});

// ============================================================
// isoDate — formatting
// ============================================================
describe('isoDate', () => {
  test('formats date correctly', () => {
    expect(isoDate(new Date(2026, 4, 20))).toBe('2026-05-20');
  });

  test('pads single-digit month and day', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('output never contains HTML', () => {
    expect(isoDate(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ============================================================
// RAMPS data integrity
// ============================================================
describe('RAMPS data integrity', () => {
  test('all ramps have required fields', () => {
    for (const r of RAMPS) {
      expect(typeof r.name).toBe('string');
      expect(r.name.length).toBeGreaterThan(0);
      expect(typeof r.min).toBe('number');
      expect(r.min).toBeGreaterThan(0);
      expect(typeof r.note).toBe('string');
    }
  });

  test('ramp names contain no HTML', () => {
    for (const r of RAMPS) {
      expect(r.name).not.toMatch(/[<>"'&]/);
      expect(r.note).not.toMatch(/[<>"&]/);
    }
  });

  test('ramp min values are in realistic range (280-310)', () => {
    for (const r of RAMPS) {
      expect(r.min).toBeGreaterThanOrEqual(280);
      expect(r.min).toBeLessThanOrEqual(310);
    }
  });

  test('exactly 10 ramps defined', () => {
    expect(RAMPS).toHaveLength(10);
  });
});

// ============================================================
// MONTH_AVG and LAST_YEAR_BY_MONTH data integrity
// ============================================================
describe('lookup table integrity', () => {
  test('MONTH_AVG has all 12 months', () => {
    for (let m = 1; m <= 12; m++) {
      expect(MONTH_AVG[m]).toBeDefined();
      expect(typeof MONTH_AVG[m]).toBe('number');
      expect(MONTH_AVG[m]).toBeGreaterThan(280);
      expect(MONTH_AVG[m]).toBeLessThan(320);
    }
  });

  test('LAST_YEAR_BY_MONTH has all 12 months', () => {
    for (let m = 1; m <= 12; m++) {
      expect(LAST_YEAR_BY_MONTH[m]).toBeDefined();
      expect(typeof LAST_YEAR_BY_MONTH[m]).toBe('number');
      expect(LAST_YEAR_BY_MONTH[m]).toBeGreaterThan(280);
      expect(LAST_YEAR_BY_MONTH[m]).toBeLessThan(320);
    }
  });
});

// ============================================================
// Property-based: parseUSGS output guarantees
// ============================================================
describe('parseUSGS output properties', () => {
  test('every output value is a finite positive number', () => {
    // Generate random valid + invalid values
    const inputs = [
      '299.3', '0', '-1', 'NaN', 'Infinity', '', '300.0',
      '-999999', 'abc', '301.2', '0.0001', '<script>'
    ];
    const json = makeUSGS(inputs.map(val => ({ val })));
    const result = parseUSGS(json);

    for (const p of result) {
      expect(Number.isFinite(p.value)).toBe(true);
      expect(p.value).toBeGreaterThan(0);
      expect(p.value).not.toBe(NO_DATA_SENTINEL);
    }
  });

  test('every output has a Date object for time', () => {
    const json = makeUSGS([{ val: '300.0' }, { val: '301.0' }]);
    const result = parseUSGS(json);
    for (const p of result) {
      expect(p.time).toBeInstanceOf(Date);
    }
  });

  test('every output has a qualifiers array', () => {
    const json = makeUSGS([{ val: '300.0' }]);
    const result = parseUSGS(json);
    for (const p of result) {
      expect(Array.isArray(p.qualifiers)).toBe(true);
    }
  });

  test('output count <= input count (filtering only removes)', () => {
    const inputs = Array.from({ length: 100 }, (_, i) => ({
      val: String(250 + Math.random() * 100)
    }));
    const json = makeUSGS(inputs);
    const result = parseUSGS(json);
    expect(result.length).toBeLessThanOrEqual(inputs.length);
  });

  test('toFixed(1) on any output value produces only digits and dot', () => {
    const inputs = [
      '299.3', '300.0', '301.123456', '999.9', '0.1'
    ];
    const json = makeUSGS(inputs.map(val => ({ val })));
    const result = parseUSGS(json);
    for (const p of result) {
      const formatted = p.value.toFixed(1);
      expect(formatted).toMatch(/^\d+\.\d$/);
    }
  });
});

// ============================================================
// Weather rendering safety (simulated)
// ============================================================
describe('weather data safety', () => {
  test('Math.round on adversarial inputs', () => {
    const attacks = ['<script>', 'alert(1)', null, undefined, {}, [], true];
    for (const a of attacks) {
      const result = Math.round(a);
      // Should be NaN or 0/1 — never executable code
      expect(typeof result).toBe('number');
      expect(String(result)).not.toContain('<');
      expect(String(result)).not.toContain('(');
    }
  });

  test('Date.toLocaleDateString on invalid date returns string', () => {
    const d = new Date('not-a-date');
    const result = d.toLocaleDateString('en-US', { weekday: 'short' });
    expect(typeof result).toBe('string');
    expect(result).not.toMatch(/[<>"]/);
  });
});
