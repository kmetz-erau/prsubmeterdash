'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatNumber, MeterReading, parseMeterCsv } from '../../lib/data';
import { lookupProperty } from '../../lib/property-map';

const DATA_FILE = '/data/AiM_meter_readings_2026-10-26.csv';
function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

const FALLBACK_RANGE_END = isoDate(new Date());
const FALLBACK_RANGE_START = isoDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

type WeatherDay = { date: string; tavg?: number; hdd: number; cdd: number };
type Ranking = { key: string; name: string; property: string; use: string; usage: number; degreeDays: number; intensity: number; meters: Set<string>; readings: number };

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value, value % 1 ? 1 : 0);
}

export default function WeatherPage() {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [weather, setWeather] = useState<{ station?: { id: string; name: string }; daily?: WeatherDay[]; updatedAt?: string; error?: string }>({});
  const [unit, setUnit] = useState('KWH');
  const [metric, setMetric] = useState<'hdd' | 'cdd'>('hdd');
  const [view, setView] = useState<'building' | 'use'>('building');
  const [sort, setSort] = useState<'intensity' | 'usage'>('intensity');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ start: FALLBACK_RANGE_START, end: FALLBACK_RANGE_END });

  useEffect(() => {
    fetch(DATA_FILE).then((response) => response.text()).then((csv) => {
      const parsed = parseMeterCsv(csv);
      setReadings(parsed);
      const dates = parsed.map((row) => new Date(row.readingDate).getTime()).filter(Number.isFinite);
      const endDate = dates.length ? new Date(Math.max(...dates)) : new Date();
      const startDate = new Date(endDate.getTime() - 29 * 24 * 60 * 60 * 1000);
      const nextRange = { start: isoDate(startDate), end: isoDate(endDate) };
      setRange(nextRange);
      return fetch(`/api/weather?start=${nextRange.start}&end=${nextRange.end}`);
    }).then((response) => response.json()).then(setWeather).catch(() => setWeather({ error: 'Unable to load NOAA historical data' }));
  }, []);

  const weatherByMonth = useMemo(() => {
    const grouped = new Map<string, { hdd: number; cdd: number }>();
    (weather.daily || []).forEach((day) => {
      const month = day.date.slice(0, 7);
      const current = grouped.get(month) || { hdd: 0, cdd: 0 };
      current.hdd += day.hdd || 0;
      current.cdd += day.cdd || 0;
      grouped.set(month, current);
    });
    return grouped;
  }, [weather.daily]);

  const rankings = useMemo<Ranking[]>(() => {
    const grouped = new Map<string, Ranking>();
    readings.filter((row) => {
      const date = new Date(row.readingDate);
      return date >= new Date(`${range.start}T00:00:00`) && date <= new Date(`${range.end}T23:59:59`) && (unit === 'All units' || row.normalizedUom === unit);
    }).forEach((row) => {
      const property = row.asset?.property || 'Unmapped';
      const info = lookupProperty(property);
      const key = view === 'building' ? property : info?.use || 'Other';
      const name = view === 'building' ? info?.name || property : key;
      const month = row.readingDate ? new Date(row.readingDate).toISOString().slice(0, 7) : '';
      const degreeDays = weatherByMonth.get(month)?.[metric] || 0;
      const current = grouped.get(key) || { key, name, property, use: info?.use || 'Other', usage: 0, degreeDays: 0, intensity: 0, meters: new Set<string>(), readings: 0 };
      current.usage += row.normalizedUsage;
      current.degreeDays += degreeDays;
      current.meters.add(row.asset?.asset || row.meter);
      current.readings += 1;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).map((row) => ({ ...row, intensity: row.degreeDays > 0 ? row.usage / row.degreeDays : 0 })).filter((row) => !search || `${row.name} ${row.property} ${row.use}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'intensity' ? b.intensity - a.intensity : b.usage - a.usage);
  }, [readings, unit, metric, view, sort, search, weatherByMonth, range]);

  const totalDegreeDays = (weather.daily || []).reduce((sum, day) => sum + (day[metric] || 0), 0);
  const weatherMonths = weatherByMonth.size;
  const maxValue = Math.max(...rankings.map((row) => sort === 'intensity' ? row.intensity : row.usage), 1);
  const unitLabel = unit === 'All units' ? 'normalized units' : unit;

  return <main className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">A</div><div><strong>AiM</strong><span>Meter intelligence</span></div></div><nav><a href="/"><span>◈</span> Overview</a><a href="/buildings"><span>⌘</span> Building rankings</a><a className="active" href="/weather"><span>☼</span> Historical weather</a><a href="/#mapping"><span>⌘</span> Buildings & accounts</a></nav><div className="sidebar-bottom"><div className="sync-dot" /><div><small>Weather source</small><strong>NOAA NCEI</strong><span>Last 30 days of data</span></div></div></aside><section className="content"><header className="topbar"><div><p className="eyebrow">ANALYSIS / WEATHER</p><h1>30-day weather normalization</h1></div><div className="top-actions"><span className="status-pill"><i /> Historical mode</span><a className="export-btn" href="/">← Back to overview</a></div></header><section className="weather-hero"><div><p className="eyebrow">BUILDING ENERGY × DEGREE DAYS</p><h2>Rank buildings by usage per HDD or CDD</h2><p>This view joins the last 30 days of available meter readings to NOAA historical daily temperatures. Choose HDD to analyze heating-driven demand or CDD to analyze cooling-driven demand.</p></div><div className="weather-location"><span>{weather.station?.name || 'NOAA station'}</span><strong>{weather.daily?.length || 0}</strong><small>historical weather days loaded</small></div></section>{weather.error ? <div className="setup-banner"><strong>Historical NOAA data is not connected.</strong><span>{weather.error}</span><small>Check the Prescott station configuration and NOAA availability.</small></div> : null}<div className="weather-controls"><div className="segmented"><button className={metric === 'hdd' ? 'active' : ''} onClick={() => setMetric('hdd')}>Heating · HDD</button><button className={metric === 'cdd' ? 'active' : ''} onClick={() => setMetric('cdd')}>Cooling · CDD</button></div><div className="segmented"><button className={view === 'building' ? 'active' : ''} onClick={() => setView('building')}>By building</button><button className={view === 'use' ? 'active' : ''} onClick={() => setView('use')}>By use</button></div><label><span>Energy unit</span><select value={unit} onChange={(e) => setUnit(e.target.value)}><option>KWH</option><option>CCF</option><option>GAL</option><option>All units</option></select></label><label><span>Rank by</span><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="intensity">Usage / degree day</option><option value="usage">Total usage</option></select></label><label className="ranking-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buildings or uses" /></label></div><section className="weather-stats"><article><span>{metric.toUpperCase()}</span><strong>{formatNumber(totalDegreeDays, 0)}</strong><small>{range.start} through {range.end}</small></article><article><span>Weather days</span><strong>{weather.daily?.length || 0}</strong><small>Last 30 days of available data</small></article><article><span>Usage in view</span><strong>{compact(rankings.reduce((sum, row) => sum + row.usage, 0))}</strong><small>{unitLabel}</small></article><article><span>Weather station</span><strong>{weather.station ? 'Live' : 'Setup'}</strong><small>{weather.station?.id || 'NOAA station unavailable'}</small></article></section><section className="card ranking-card"><div className="card-head"><div><p className="eyebrow">HISTORICAL RANKING</p><h2>{view === 'building' ? 'Buildings' : 'Building uses'} by {metric.toUpperCase()} intensity</h2></div><span className="unit-tag">{unitLabel} / {metric.toUpperCase()}</span></div><div className="ranking-header"><span>Rank</span><span>{view === 'building' ? 'Building' : 'Use category'}</span><span>Intensity</span><span>Total</span><span>Degree days</span></div>{rankings.map((row, index) => { const value = sort === 'intensity' ? row.intensity : row.usage; return <a className="ranking-row" key={row.key} href={view === 'building' ? `/?property=${encodeURIComponent(row.property)}` : `/buildings?use=${encodeURIComponent(row.use)}`}><span className="ranking-number">{String(index + 1).padStart(2, '0')}</span><div className="ranking-name"><strong>{row.name}</strong><small>{view === 'building' ? `${row.property} · ${row.use} · ${row.meters.size} meters` : `${row.meters.size} meters across ${row.readings} readings`}</small><div className="ranking-track"><i style={{ width: `${Math.max(value / maxValue * 100, 2)}%` }} /></div></div><strong className="ranking-value">{compact(row.intensity)} <small>{unitLabel}/{metric.toUpperCase()}</small></strong><span>{compact(row.usage)} {unitLabel}</span><span>{formatNumber(row.degreeDays, 0)}</span></a>})}{!rankings.length && <div className="empty">No historical rankings available. Check the NOAA station connection and date range.</div>}</section><footer>AiM Meter Intelligence <span>•</span> NOAA NCEI historical data <span>•</span> {weather.updatedAt ? `Updated ${new Date(weather.updatedAt).toLocaleString()}` : 'Waiting for NOAA data'}</footer></section></main>;
}
