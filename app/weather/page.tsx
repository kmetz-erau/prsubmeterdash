'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatNumber, MeterReading, parseMeterCsv } from '../../lib/data';
import { lookupProperty } from '../../lib/property-map';

const DATA_FILE = '/data/AiM_meter_readings_2026-10-26.csv';
const HEATING_BASE = 65;
const USE_SENSITIVITY: Record<string, { heat: number; cool: number }> = {
  Residential: { heat: 1, cool: 1 },
  'Mixed use': { heat: 0.8, cool: 0.85 },
  Offices: { heat: 0.55, cool: 0.8 },
  'Classrooms': { heat: 0.65, cool: 0.85 },
  Recreation: { heat: 0.4, cool: 0.7 },
  'Locker room': { heat: 0.7, cool: 0.7 },
  Field: { heat: 0.2, cool: 0.35 },
  Cafeteria: { heat: 0.5, cool: 0.6 },
  Other: { heat: 0.5, cool: 0.5 },
};

type WeatherPeriod = { startTime: string; temperature: number; temperatureUnit: string; probabilityOfPrecipitation: number; shortForecast: string; isDaytime: boolean };

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value, value % 1 ? 1 : 0);
}

export default function WeatherPage() {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [weather, setWeather] = useState<{ location?: { city: string; state: string }; updatedAt?: string; periods?: WeatherPeriod[]; error?: string }>({});
  const [unit, setUnit] = useState('KWH');
  const [days, setDays] = useState('7');

  useEffect(() => {
    fetch(DATA_FILE).then((response) => response.text()).then((csv) => setReadings(parseMeterCsv(csv)));
    fetch('/api/weather').then((response) => response.json()).then(setWeather).catch(() => setWeather({ error: 'Unable to load NOAA weather data' }));
  }, []);

  const weatherWindow = useMemo(() => (weather.periods || []).slice(0, Number(days) * 24), [weather.periods, days]);
  const degreeDays = useMemo(() => weatherWindow.reduce((summary, period) => {
    const temperature = Number(period.temperature) || HEATING_BASE;
    summary.hdd += Math.max(HEATING_BASE - temperature, 0) / 24;
    summary.cdd += Math.max(temperature - HEATING_BASE, 0) / 24;
    return summary;
  }, { hdd: 0, cdd: 0 }), [weatherWindow]);

  const rankings = useMemo(() => {
    const grouped = new Map<string, { use: string; buildings: Set<string>; readings: number; usage: number; adjusted: number }>();
    readings.filter((row) => unit === 'All units' || row.normalizedUom === unit).forEach((row) => {
      const use = lookupProperty(row.asset?.property || '')?.use || 'Other';
      const existing = grouped.get(use) || { use, buildings: new Set<string>(), readings: 0, usage: 0, adjusted: 0 };
      const sensitivity = USE_SENSITIVITY[use] || USE_SENSITIVITY.Other;
      const weatherLoad = 1 + ((degreeDays.hdd * sensitivity.heat) + (degreeDays.cdd * sensitivity.cool)) / 100;
      existing.buildings.add(row.asset?.property || row.meter);
      existing.readings += 1;
      existing.usage += row.normalizedUsage;
      existing.adjusted += row.normalizedUsage / weatherLoad;
      grouped.set(use, existing);
    });
    return Array.from(grouped.values()).sort((a, b) => b.adjusted - a.adjusted);
  }, [readings, unit, degreeDays]);

  const maxAdjusted = Math.max(...rankings.map((row) => row.adjusted), 1);
  const dayCards = weatherWindow.filter((period, index) => index % 24 === 0).slice(0, Number(days));

  return <main className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">A</div><div><strong>AiM</strong><span>Meter intelligence</span></div></div><nav><a href="/"><span>◈</span> Overview</a><a href="/buildings"><span>⌘</span> Building rankings</a><a className="active" href="/weather"><span>☼</span> Weather normalization</a><a href="/#mapping"><span>⌘</span> Buildings & accounts</a></nav><div className="sidebar-bottom"><div className="sync-dot" /><div><small>Weather source</small><strong>NOAA / NWS</strong><span>Campus forecast point</span></div></div></aside><section className="content"><header className="topbar"><div><p className="eyebrow">ANALYSIS / WEATHER</p><h1>Weather normalization</h1></div><div className="top-actions"><span className="status-pill"><i /> NOAA connected</span><a className="export-btn" href="/">← Back to overview</a></div></header><section className="weather-hero"><div><p className="eyebrow">BUILDING USE × WEATHER</p><h2>Which building uses are weather-sensitive?</h2><p>Degree-day adjusted rankings help separate weather-driven demand from building-use patterns. This first version uses the NOAA/NWS forecast for the campus point and normalizes the usage history against expected heating and cooling load.</p></div><div className="weather-location"><span>{weather.location?.city || 'Campus'}, {weather.location?.state || 'AZ'}</span><strong>{Math.round(weatherWindow.reduce((sum, p) => sum + (Number(p.temperature) || 0), 0) / Math.max(weatherWindow.length, 1)) || '—'}°F</strong><small>average forecast temperature</small></div></section><div className="weather-controls"><label><span>Usage unit</span><select value={unit} onChange={(e) => setUnit(e.target.value)}><option>KWH</option><option>CCF</option><option>GAL</option><option>All units</option></select></label><label><span>Forecast window</span><select value={days} onChange={(e) => setDays(e.target.value)}><option value="3">Next 3 days</option><option value="7">Next 7 days</option></select></label><div className="weather-method"><strong>Method</strong><span>Adjusted usage = actual usage ÷ weather load index</span></div></div><section className="weather-stats"><article><span>Heating degree days</span><strong>{degreeDays.hdd.toFixed(1)}</strong><small>Base {HEATING_BASE}°F</small></article><article><span>Cooling degree days</span><strong>{degreeDays.cdd.toFixed(1)}</strong><small>Base {HEATING_BASE}°F</small></article><article><span>Usage in view</span><strong>{compact(rankings.reduce((sum, row) => sum + row.usage, 0))}</strong><small>{unit === 'All units' ? 'normalized units' : unit}</small></article><article><span>Data status</span><strong>{weather.error ? 'Issue' : 'Live'}</strong><small>{weather.error || 'NOAA/NWS forecast loaded'}</small></article></section><section className="weather-grid"><article className="card weather-card"><div className="card-head"><div><p className="eyebrow">NORMALIZED RANKING</p><h2>Building use categories</h2></div><span className="unit-tag">Weather-adjusted</span></div><div className="weather-ranking">{rankings.map((row, index) => <div className="weather-ranking-row" key={row.use}><span className="rank">0{index + 1}</span><div className="weather-rank-name"><div><strong>{row.use}</strong><span>{row.buildings.size} buildings · {formatNumber(row.readings)} readings</span></div><div className="meter-track"><i style={{ width: `${Math.max(row.adjusted / maxAdjusted * 100, 3)}%` }} /></div></div><strong>{compact(row.adjusted)} <small>{unit === 'All units' ? 'normalized' : unit}</small></strong></div>)}{!rankings.length && <div className="empty">No mapped readings found.</div>}</div></article><article className="card weather-card"><div className="card-head"><div><p className="eyebrow">OUTLOOK</p><h2>Campus forecast</h2></div><span className="muted">Next {days} days</span></div><div className="forecast-list">{dayCards.map((period) => <div className="forecast-row" key={period.startTime}><div><strong>{new Date(period.startTime).toLocaleDateString('en-US', { weekday: 'short' })}</strong><span>{new Date(period.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div><strong>{period.temperature}°{period.temperatureUnit === 'F' ? 'F' : period.temperatureUnit}</strong><span>{period.shortForecast}</span><small>{period.probabilityOfPrecipitation}% precip.</small></div>)}{weather.error && <div className="empty">{weather.error}</div>}</div></article></section><footer>AiM Meter Intelligence <span>•</span> NOAA/NWS forecast-backed analysis <span>•</span> {weather.updatedAt ? `Updated ${new Date(weather.updatedAt).toLocaleTimeString()}` : 'Loading weather'}</footer></section></main>;
}
