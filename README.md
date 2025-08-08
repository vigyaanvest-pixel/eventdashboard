# Events Radar — Public Site (eventbundle.js)

A minimal static site that loads **eventbundle.js** (your daily data file) and displays a filterable table.

## Quick start
1. Create a new GitHub repo and upload these files.
2. Turn on **GitHub Pages** (Settings → Pages → Deploy from branch).
3. Open the site URL — it will load `eventbundle.js` with cache-busting.

## Update data daily
- Replace `eventbundle.js` with the new bundle (same schema).
- The page appends `?v=timestamp` so visitors get fresh data on reload.

## Data schema
```json
{
  "date": "YYYY-MM-DD",
  "time_et": "HH:MM",
  "symbol": "TICKER",
  "name": "Short event title",
  "type": "Company | Policy / Legislation | Regulatory | Macro | Sector Conf | Industry Print | Market Micro",
  "domain": "Category (e.g., Inflation, Digital assets, FDA)",
  "stage": "Milestone (e.g., Release, Markup, Minutes)",
  "why": "Short phrase (keep concise)",
  "source": "https://...",
  "notes": "Optional, longer notes (shown when row is expanded)"
}
```
Save an array of these objects in `eventbundle.js` as:
```js
window.EVENTS = [ /* ... */ ];
```
