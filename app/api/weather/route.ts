import { NextResponse } from 'next/server';

const DEFAULT_START = '2024-04-01';
const DEFAULT_END = '2026-09-30';
const CDO = 'https://www.ncei.noaa.gov/cdo-web/api/v2';

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const token = process.env.NOAA_CDO_TOKEN;
  if (!token) return NextResponse.json({ error: 'NOAA_CDO_TOKEN is not configured. Add a NOAA Climate Data Online token in Vercel environment variables.' }, { status: 503 });

  const url = new URL(request.url);
  const start = url.searchParams.get('start') || DEFAULT_START;
  const end = url.searchParams.get('end') || DEFAULT_END;
  const location = process.env.NOAA_CDO_LOCATION || 'ZIP:86301';
  const headers = { token, Accept: 'application/json' };

  try {
    const stationUrl = new URL(`${CDO}/stations`);
    stationUrl.searchParams.set('datasetid', 'GHCND');
    stationUrl.searchParams.set('locationid', location);
    stationUrl.searchParams.set('limit', '1000');
    stationUrl.searchParams.set('sortfield', 'datacoverage');
    stationUrl.searchParams.set('sortorder', 'desc');
    const stationResponse = await fetch(stationUrl, { headers, next: { revalidate: 86400 } });
    if (!stationResponse.ok) throw new Error(`NOAA station lookup failed: ${stationResponse.status}`);
    const stations = await stationResponse.json();
    const station = stations.results?.find((item: { mindate?: string; maxdate?: string }) => (item.mindate || '') <= start && (item.maxdate || '') >= end) || stations.results?.[0];
    if (!station?.id) throw new Error(`No NOAA GHCND station found for ${location}`);

    const chunks: Array<{ start: string; end: string }> = [];
    let cursor = new Date(`${start}T00:00:00Z`);
    const finalDate = new Date(`${end}T00:00:00Z`);
    while (cursor <= finalDate) {
      const chunkEnd = new Date(cursor);
      chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 364);
      if (chunkEnd > finalDate) chunkEnd.setTime(finalDate.getTime());
      chunks.push({ start: cursor.toISOString().slice(0, 10), end: chunkEnd.toISOString().slice(0, 10) });
      cursor = new Date(`${addDays(chunkEnd, 1)}T00:00:00Z`);
    }

    const data = [];
    for (const chunk of chunks) {
      for (const datatype of ['TAVG', 'HTDD', 'CLDD']) {
        const dataUrl = new URL(`${CDO}/data`);
        dataUrl.searchParams.set('datasetid', 'GHCND');
        dataUrl.searchParams.set('stationid', station.id);
        dataUrl.searchParams.set('startdate', chunk.start);
        dataUrl.searchParams.set('enddate', chunk.end);
        dataUrl.searchParams.set('datatypeid', datatype);
        dataUrl.searchParams.set('units', 'standard');
        dataUrl.searchParams.set('limit', '1000');
        const response = await fetch(dataUrl, { headers, next: { revalidate: 86400 } });
        if (!response.ok) throw new Error(`NOAA historical data request failed: ${response.status}`);
        const result = await response.json();
        data.push(...(result.results || []));
      }
    }

    const daily = new Map<string, { date: string; tavg?: number; hdd: number; cdd: number }>();
    data.forEach((item: { date: string; datatype: string; value: number }) => {
      const date = item.date.slice(0, 10);
      const row = daily.get(date) || { date, hdd: 0, cdd: 0 };
      if (item.datatype === 'TAVG') row.tavg = item.value;
      if (item.datatype === 'HTDD') row.hdd = item.value;
      if (item.datatype === 'CLDD') row.cdd = item.value;
      daily.set(date, row);
    });

    // Some GHCND stations provide TAVG but not HTDD/CLDD. Derive the missing
    // degree-day values from the daily average using the standard 65°F base.
    daily.forEach((row) => {
      if (row.tavg === undefined) return;
      if (row.hdd === 0) row.hdd = Math.max(65 - row.tavg, 0);
      if (row.cdd === 0) row.cdd = Math.max(row.tavg - 65, 0);
    });

    return NextResponse.json({ station: { id: station.id, name: station.name, location }, start, end, updatedAt: new Date().toISOString(), daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load NOAA historical weather data' }, { status: 502 });
  }
}
