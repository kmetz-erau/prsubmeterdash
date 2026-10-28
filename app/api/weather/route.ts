import { NextResponse } from 'next/server';

const DEFAULT_START = '2024-04-01';
const DEFAULT_END = '2026-09-30';
const DEFAULT_STATION = 'USC00026796'; // Prescott, AZ COOP station
const NCEI_DATA = 'https://www.ncei.noaa.gov/access/services/data/v1';

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get('start') || DEFAULT_START;
  const end = url.searchParams.get('end') || DEFAULT_END;
  const station = process.env.NOAA_STATION_ID || DEFAULT_STATION;

  try {
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

    const daily = new Map<string, { date: string; tavg?: number; tmax?: number; tmin?: number; hdd: number; cdd: number }>();
    for (const chunk of chunks) {
      const dataUrl = new URL(NCEI_DATA);
      dataUrl.searchParams.set('dataset', 'daily-summaries');
      dataUrl.searchParams.set('stations', station);
      dataUrl.searchParams.set('startDate', chunk.start);
      dataUrl.searchParams.set('endDate', chunk.end);
      dataUrl.searchParams.set('dataTypes', 'TAVG,TMAX,TMIN');
      dataUrl.searchParams.set('format', 'json');
      dataUrl.searchParams.set('units', 'standard');
      const response = await fetch(dataUrl, { next: { revalidate: 86400 } });
      if (!response.ok) throw new Error(`NCEI historical data request failed: ${response.status}`);
      const result = await response.json();
      (Array.isArray(result) ? result : []).forEach((item: { DATE?: string; TAVG?: number; TMAX?: number; TMIN?: number }) => {
        if (!item.DATE) return;
        const date = item.DATE.slice(0, 10);
        const row = daily.get(date) || { date, hdd: 0, cdd: 0 };
        const average = numeric(item.TAVG);
        const maximum = numeric(item.TMAX);
        const minimum = numeric(item.TMIN);
        if (average !== undefined) row.tavg = average;
        if (maximum !== undefined) row.tmax = maximum;
        if (minimum !== undefined) row.tmin = minimum;
        daily.set(date, row);
      });
    }

    daily.forEach((row) => {
      const average = row.tavg ?? (row.tmax !== undefined && row.tmin !== undefined ? (row.tmax + row.tmin) / 2 : undefined);
      if (average === undefined) return;
      row.tavg = average;
      row.hdd = Math.max(65 - average, 0);
      row.cdd = Math.max(average - 65, 0);
    });

    return NextResponse.json({ station: { id: station, name: 'Prescott, AZ' }, start, end, updatedAt: new Date().toISOString(), daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load NOAA historical weather data' }, { status: 502 });
  }
}
