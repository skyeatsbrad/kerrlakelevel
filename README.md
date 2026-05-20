# kerrlakelevel.com

A fast, mobile-first single-page site showing live water levels at **Kerr Lake**
(John H. Kerr Reservoir, VA/NC) using free USGS data.

> **Target user:** someone standing at the boat ramp on their phone asking
> *"is the lake level OK right now?"*

## Features

- **Current elevation** (large, readable number) with diff from full pool (300 ft)
- **Trend indicator** — Rising / Falling / Stable with ft/day rate
- **Plain-English status** — color-coded message about ramp conditions
- **Auto-refresh** every 15 minutes (and on tab focus after 5+ min)
- **30-day chart** (Chart.js) with the 300 ft full-pool reference line
- **"Last year on this date"** comparison
- **Historical monthly average** + seasonal context note
- **Boat ramp accessibility** — green/yellow/red status for 10 major ramps
- **7-day weather forecast** for Clarksville, VA (Open-Meteo)
- **Auto dark/light mode** via `prefers-color-scheme`
- **No backend, no build step, no API keys**

## Tech

- Vanilla HTML / CSS / JS
- [Chart.js 4](https://www.chartjs.org/) via CDN (with a tiny inline date adapter — no extra dependency)
- Data:
  - [USGS NWIS Instantaneous Values](https://waterservices.usgs.gov/) — station `02079490`, parameter `62614`
  - [Open-Meteo Forecast API](https://open-meteo.com/) — Clarksville, VA

Both APIs allow CORS from the browser, so the site works as pure static HTML.

## File structure

```
kerrlakelevel/
├── index.html       Main page
├── style.css        All styles (light + dark)
├── app.js           Data fetching, rendering, chart, auto-refresh
├── favicon.svg      Water-drop icon
└── README.md        This file
```

## Run locally

Just open `index.html` in a browser, **or** serve it with any static server:

```powershell
# Python (any version)
cd C:\Users\bradleywo\kerrlakelevel
python -m http.server 8080
# then visit http://localhost:8080
```

```powershell
# Node
npx serve .
```

No `npm install`. No build. No env vars.

## Deploy

This is a fully static site — deploy anywhere:

### Vercel
```
vercel deploy
```

### Netlify
Drag the `kerrlakelevel/` folder onto https://app.netlify.com/drop

### GitHub Pages
Push the folder to a `gh-pages` branch (or set Pages to serve from `/`).

### Custom domain (`kerrlakelevel.com`)
Point an `A`/`CNAME` record at your host of choice. Nothing else needed.

## Data notes

- USGS readings are typically posted every 15 minutes.
- A `P` qualifier on a reading means **provisional** — a small badge is shown
  in the hero card when the latest reading is provisional.
- The sentinel value `-999999` is treated as missing data.
- All times displayed in **Eastern Time** (the lake is on ET).
- Boat-ramp minimum-usable values are community estimates; verify locally
  before launching.

## License

MIT — do what you like.

Data © USGS (public domain) and Open-Meteo (CC-BY 4.0).
