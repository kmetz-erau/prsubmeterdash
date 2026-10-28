# AiM Meter Intelligence Dashboard

A Vercel-ready Next.js dashboard for the AssetWorks AiM meter-readings export.

## What is included

- Interactive filtering by unit, meter, search term, date range, and exceptions.
- Normalized usage totals so electricity is reported in KWH and natural gas in CCF; water remains in GAL.
- Automatic normalization: MWH/GWH are converted to KWH, and CF is converted to CCF. Water readings in GAL remain GAL.
- Monthly usage trend, highest-usage meter ranking, verification KPIs, and recent-reading table.
- Source links back to the AiM meter-reading record when available.
- Asset mapping for electric, gas, and water meters, including property and parent commercial meter.
- Buildings & commercial accounts explorer with searchable property roll-ups and utility-rate details.
- NOAA/NWS weather normalization page with forecast-backed HDD/CDD adjustments by building-use category.
- The supplied CSV is served from `public/data`, so the dashboard can deploy to Vercel with no database.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Push this folder to GitHub.
2. In Vercel, choose **New Project** and import the repository.
3. Keep the defaults: Vercel detects Next.js automatically.
4. Deploy.

No environment variables are required for this static export-backed dashboard.

The weather page uses the NOAA/NWS API through `/api/weather`. Optional environment variables are `NOAA_USER_AGENT`, `WEATHER_LAT`, and `WEATHER_LON`; the defaults point to the ERAU Prescott campus area.

The provided property/building context is retained at `public/data/property-context.md`. Meters that do not appear in the supplied asset map remain labeled `Unmapped` so they can be reviewed without inventing an association.

## Updating the data

Replace `public/data/AiM_meter_readings_2026-10-26.csv` with a new export using the same column headers, commit, and redeploy. For an automated pipeline, the next step would be moving the CSV to Blob Storage or a database and replacing the client-side fetch in `app/page.tsx` with a server/API data source.

## Normalization rules

| Source unit | Dashboard unit | Factor |
| --- | --- | ---: |
| KWH | KWH | 1 |
| MWH | KWH | 1,000 |
| GWH | KWH | 1,000,000 |
| CF | CCF | 0.01 |
| CCF | CCF | 1 |
| GAL | GAL | 1 |
