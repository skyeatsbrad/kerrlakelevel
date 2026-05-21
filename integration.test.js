/**
 * Integration tests against production-like environment.
 * Tests the LIVE site (kerrlakelevel.com) and local server in a real browser.
 *
 * Covers: page load, API data flow, DOM rendering, responsive layout,
 * error handling, performance, accessibility basics, and cross-origin behavior.
 */

const puppeteer = require('puppeteer-core');

const PROD_URL = 'http://kerrlakelevel.com';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TIMEOUT = 30000;

let browser, page;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: 'new',
    executablePath: EDGE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}, TIMEOUT);

afterAll(async () => {
  if (browser) await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);
});

afterEach(async () => {
  if (page) await page.close();
});

// ============================================================
// 1. PAGE LOAD & BASIC RENDERING
// ============================================================
describe('Page Load', () => {
  test('site returns 200 and renders title', async () => {
    const response = await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    expect(response.status()).toBe(200);
    const title = await page.title();
    expect(title).toContain('Kerr Lake');
  }, TIMEOUT);

  test('all critical DOM elements exist', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });

    const requiredIds = [
      'bigNumber', 'diffFromFull', 'provisionalBadge', 'trend',
      'statusMessage', 'updatedAt', 'poolBarFill', 'poolBarMarker',
      'lastYearValue', 'lastYearDelta', 'monthName', 'monthAvgValue',
      'monthAvgDelta', 'seasonalNote', 'rampList', 'chart30',
      'chartLoading', 'weather', 'refreshBtn'
    ];

    for (const id of requiredIds) {
      const el = await page.$(`#${id}`);
      expect(el).not.toBeNull();
    }
  }, TIMEOUT);

  test('no JavaScript errors on page load', async () => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    // Wait for all async data to load
    await page.waitForFunction(() => {
      const bn = document.getElementById('bigNumber');
      return bn && bn.textContent.trim() !== '' && !bn.textContent.includes('loading');
    }, { timeout: 20000 });
    expect(errors).toEqual([]);
  }, TIMEOUT);
});

// ============================================================
// 2. LIVE USGS API INTEGRATION
// ============================================================
describe('USGS API Data Flow', () => {
  test('hero displays a valid elevation number', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('bigNumber');
      return el && /\d{2,3}\.\d/.test(el.textContent);
    }, { timeout: 20000 });

    const text = await page.$eval('#bigNumber', el => el.textContent);
    const match = text.match(/([\d.]+)/);
    expect(match).not.toBeNull();
    const value = parseFloat(match[1]);
    expect(value).toBeGreaterThan(280);
    expect(value).toBeLessThan(320);
  }, TIMEOUT);

  test('diff from pool displays correctly', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('diffFromFull');
      return el && el.textContent.length > 0;
    }, { timeout: 20000 });

    const text = await page.$eval('#diffFromFull', el => el.textContent);
    expect(text).toMatch(/(below|above|At) full pool/);
  }, TIMEOUT);

  test('updated timestamp is recent (within 1 hour)', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('updatedAt');
      return el && el.textContent.includes('Updated');
    }, { timeout: 20000 });

    const text = await page.$eval('#updatedAt', el => el.textContent);
    expect(text).toMatch(/Updated \d+ (minutes?|seconds?|hour) ago/);
  }, TIMEOUT);

  test('trend badge shows Rising, Falling, or Stable', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('trend');
      return el && el.textContent.length > 0;
    }, { timeout: 20000 });

    const text = await page.$eval('#trend', el => el.textContent);
    expect(text).toMatch(/(Rising|Falling|Stable)/);
  }, TIMEOUT);
});

// ============================================================
// 3. COMPARISON DATA
// ============================================================
describe('Comparison Cards', () => {
  test('last year value shows a number or Unavailable', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('lastYearValue');
      return el && el.textContent.trim().length > 0;
    }, { timeout: 20000 });

    const text = await page.$eval('#lastYearValue', el => el.textContent);
    expect(text).toMatch(/(\d{2,3}\.\d ft|Unavailable)/);
  }, TIMEOUT);

  test('month average shows valid value', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    const text = await page.$eval('#monthAvgValue', el => el.textContent);
    expect(text).toMatch(/\d{2,3}\.\d ft/);
  }, TIMEOUT);

  test('seasonal note is populated', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    const text = await page.$eval('#seasonalNote', el => el.textContent);
    expect(text.length).toBeGreaterThan(10);
    expect(text).toMatch(/(Spring|Summer|Fall|Winter)/);
  }, TIMEOUT);
});

// ============================================================
// 4. BOAT RAMP RENDERING
// ============================================================
describe('Boat Ramps', () => {
  test('renders all 10 boat ramps', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('rampList');
      return el && el.children.length > 0;
    }, { timeout: 20000 });

    const count = await page.$eval('#rampList', el => el.children.length);
    expect(count).toBe(10);
  }, TIMEOUT);

  test('each ramp has a status badge', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('rampList');
      return el && el.children.length === 10;
    }, { timeout: 20000 });

    const statuses = await page.$$eval('.ramp-status', els =>
      els.map(el => el.textContent.trim())
    );
    expect(statuses.length).toBe(10);
    for (const s of statuses) {
      expect(s).toMatch(/(Accessible|Marginal|Below threshold)/);
    }
  }, TIMEOUT);

  test('ramp status contains no HTML injection', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.ramp-status');

    const htmlContent = await page.$eval('#rampList', el => el.innerHTML);
    expect(htmlContent).not.toMatch(/<script/i);
    expect(htmlContent).not.toMatch(/onerror/i);
    expect(htmlContent).not.toMatch(/javascript:/i);
  }, TIMEOUT);
});

// ============================================================
// 5. CHART RENDERING
// ============================================================
describe('30-Day Chart', () => {
  test('chart canvas is rendered and has content', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    // Wait for chart loading text to disappear
    await page.waitForFunction(() => {
      const loading = document.getElementById('chartLoading');
      const canvas = document.getElementById('chart30');
      return canvas && canvas.width > 0 && (!loading || loading.classList.contains('hidden') || loading.style.display === 'none' || loading.textContent === '');
    }, { timeout: 20000 });

    const canvas = await page.$('#chart30');
    expect(canvas).not.toBeNull();

    // Verify canvas has been drawn on (has non-zero dimensions)
    const dims = await page.$eval('#chart30', el => ({
      width: el.width,
      height: el.height
    }));
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  }, TIMEOUT);
});

// ============================================================
// 6. WEATHER FORECAST
// ============================================================
describe('Weather Forecast', () => {
  test('renders 7 weather day cards', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('weather');
      return el && el.children.length > 0;
    }, { timeout: 20000 });

    const count = await page.$eval('#weather', el => el.children.length);
    expect(count).toBe(7);
  }, TIMEOUT);

  test('first day is labeled Today', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.wx-day');

    const firstDay = await page.$eval('.wx-day:first-child .wx-dow', el => el.textContent);
    expect(firstDay).toBe('Today');
  }, TIMEOUT);

  test('temperatures are reasonable numbers', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.wx-hi');

    const highs = await page.$$eval('.wx-hi', els =>
      els.map(el => parseInt(el.textContent))
    );
    for (const h of highs) {
      expect(h).toBeGreaterThan(-20);
      expect(h).toBeLessThan(130);
    }
  }, TIMEOUT);

  test('weather grid contains no script injection', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.wx-day');

    const html = await page.$eval('#weather', el => el.innerHTML);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
  }, TIMEOUT);
});

// ============================================================
// 7. RESPONSIVE / MOBILE LAYOUT
// ============================================================
describe('Responsive Layout', () => {
  test('renders correctly at mobile width (375px)', async () => {
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => {
      const el = document.getElementById('bigNumber');
      return el && /\d/.test(el.textContent);
    }, { timeout: 20000 });

    // Verify hero number is visible
    const visible = await page.$eval('#bigNumber', el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    expect(visible).toBe(true);

    // Verify no horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 5;
    });
    expect(overflow).toBe(true);
  }, TIMEOUT);

  test('renders correctly at tablet width (768px)', async () => {
    await page.setViewport({ width: 768, height: 1024 });
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 5;
    });
    expect(overflow).toBe(true);
  }, TIMEOUT);

  test('renders correctly at desktop width (1440px)', async () => {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 5;
    });
    expect(overflow).toBe(true);
  }, TIMEOUT);
});

// ============================================================
// 8. PERFORMANCE
// ============================================================
describe('Performance', () => {
  test('page loads in under 10 seconds', async () => {
    const start = Date.now();
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  }, TIMEOUT);

  test('total transferred size is under 500KB', async () => {
    const client = await page.createCDPSession();
    await client.send('Network.enable');

    let totalBytes = 0;
    client.on('Network.loadingFinished', params => {
      totalBytes += params.encodedDataLength || 0;
    });

    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    // Wait for async data
    await new Promise(r => setTimeout(r, 3000));

    expect(totalBytes).toBeLessThan(500 * 1024);
  }, TIMEOUT);
});

// ============================================================
// 9. SECURITY HEADERS & CONTENT
// ============================================================
describe('Security', () => {
  test('no inline scripts in HTML (CSP readiness)', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });

    const inlineScripts = await page.$$eval('script:not([src])', els =>
      els.map(el => el.textContent.trim()).filter(t => t.length > 0)
    );
    expect(inlineScripts).toEqual([]);
  }, TIMEOUT);

  test('all external links have rel="noopener"', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });

    const unsafeLinks = await page.$$eval('a[target="_blank"]', els =>
      els.filter(el => !el.rel.includes('noopener')).map(el => el.href)
    );
    expect(unsafeLinks).toEqual([]);
  }, TIMEOUT);

  test('no sensitive data in page source', async () => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    const content = await page.content();
    expect(content).not.toMatch(/api[_-]?key/i);
    expect(content).not.toMatch(/secret/i);
    expect(content).not.toMatch(/password/i);
    expect(content).not.toMatch(/bearer/i);
  }, TIMEOUT);
});

// ============================================================
// 10. ERROR RESILIENCE
// ============================================================
describe('Error Resilience', () => {
  test('page degrades gracefully when USGS is blocked', async () => {
    // Block USGS API
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().includes('waterservices.usgs.gov')) {
        req.abort('failed');
      } else {
        req.continue();
      }
    });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));

    // Page should not crash
    expect(errors).toEqual([]);

    // Should show fallback text
    const bigNum = await page.$eval('#bigNumber', el => el.textContent);
    expect(bigNum).toMatch(/(unavailable|—|Data)/i);
  }, TIMEOUT);

  test('page degrades gracefully when weather API is blocked', async () => {
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().includes('open-meteo.com')) {
        req.abort('failed');
      } else {
        req.continue();
      }
    });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));

    expect(errors).toEqual([]);

    const weather = await page.$eval('#weather', el => el.textContent);
    expect(weather).toMatch(/(unavailable|Forecast)/i);
  }, TIMEOUT);

  test('page survives malformed USGS response', async () => {
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().includes('waterservices.usgs.gov')) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ value: { timeSeries: [{ values: [{ value: [
            { dateTime: 'not-a-date', value: '<script>alert(1)</script>', qualifiers: [] },
            { dateTime: '2026-05-20T12:00:00', value: 'NaN', qualifiers: [] },
            { dateTime: '2026-05-20T12:00:00', value: '-999999', qualifiers: [] },
          ]}]}]}})
        });
      } else {
        req.continue();
      }
    });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(PROD_URL, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));

    // No JS crashes
    expect(errors).toEqual([]);

    // Should show unavailable (all values filtered by parseUSGS)
    const bigNum = await page.$eval('#bigNumber', el => el.textContent);
    expect(bigNum).toMatch(/(unavailable|—|Data)/i);

    // Verify no XSS in DOM
    const html = await page.content();
    expect(html).not.toContain('<script>alert(1)</script>');
  }, TIMEOUT);
});
