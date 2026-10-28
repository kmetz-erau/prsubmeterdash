'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatNumber, MeterReading, parseMeterCsv } from '../../lib/data';
import { lookupProperty } from '../../lib/property-map';

const DATA_FILE = '/data/AiM_meter_readings_2026-10-26.csv';

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value, value % 1 ? 1 : 0);
}

type RankRow = {
  key: string;
  name: string;
  code: string;
  use: string;
  usage: number;
  readings: number;
  meters: number;
  types: string[];
  squareFeet?: number;
};

export default function BuildingRankings() {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [unit, setUnit] = useState('KWH');
  const [view, setView] = useState<'building' | 'use'>('building');
  const [sortBy, setSortBy] = useState<'usage' | 'readings' | 'meters'>('usage');
  const [search, setSearch] = useState('');
  const [descending, setDescending] = useState(true);

  useEffect(() => {
    fetch(DATA_FILE).then((response) => response.text()).then((csv) => setReadings(parseMeterCsv(csv)));
  }, []);

  useEffect(() => {
    const use = new URLSearchParams(window.location.search).get('use');
    if (use) { setView('use'); setSearch(use); }
  }, []);

  const rows = useMemo<RankRow[]>(() => {
    const filtered = readings.filter((row) => (unit === 'All units' || row.normalizedUom === unit) && row.asset?.property);
    const grouped = new Map<string, { code: string; name: string; use: string; usage: number; readings: number; meters: Set<string>; types: Set<string>; squareFeet?: number }>();
    filtered.forEach((row) => {
      const code = row.asset?.property || 'Unknown';
      const property = lookupProperty(code);
      const key = view === 'building' ? code : property?.use || 'Other';
      const existing = grouped.get(key) || { code, name: view === 'building' ? property?.name || code : key, use: view === 'building' ? property?.use || 'Other' : key, usage: 0, readings: 0, meters: new Set<string>(), types: new Set<string>(), squareFeet: view === 'building' ? property?.squareFeet : undefined };
      existing.usage += row.normalizedUsage;
      existing.readings += 1;
      existing.meters.add(row.asset?.asset || row.meter);
      existing.types.add(row.asset?.assetType || 'Other');
      grouped.set(key, existing);
    });
    return Array.from(grouped.values()).map((row) => ({ ...row, key: view === 'building' ? row.code : row.use, meters: row.meters.size, types: Array.from(row.types) })).filter((row) => !search || `${row.name} ${row.code} ${row.use}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
      const left = sortBy === 'usage' ? a.usage : sortBy === 'readings' ? a.readings : a.meters;
      const right = sortBy === 'usage' ? b.usage : sortBy === 'readings' ? b.readings : b.meters;
      return descending ? right - left : left - right;
    });
  }, [readings, unit, view, sortBy, search, descending]);

  const totalUsage = rows.reduce((sum, row) => sum + row.usage, 0);
  const maxUsage = Math.max(...rows.map((row) => row.usage), 1);
  const unitLabel = unit === 'All units' ? 'normalized units' : unit;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">A</div><div><strong>AiM</strong><span>Meter intelligence</span></div></div>
        <nav><a href="/"><span>◈</span> Overview</a><a className="active" href="/buildings"><span>⌘</span> Building rankings</a><a href="/weather"><span>☼</span> Weather normalization</a><a href="/#mapping"><span>⌘</span> Buildings & accounts</a><a href="/#readings"><span>▦</span> Readings</a></nav>
        <div className="sidebar-bottom"><div className="sync-dot" /><div><small>Data source</small><strong>AssetWorks AiM</strong><span>Synced Oct 26, 2026</span></div></div>
      </aside>
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">ANALYSIS / BUILDINGS</p><h1>Building rankings</h1></div><div className="top-actions"><span className="status-pill"><i /> Live dataset</span><a className="export-btn" href="/">← Back to overview</a></div></header>
        <section className="ranking-hero"><div><p className="eyebrow">USE-BASED RANKING</p><h2>Where is utility usage concentrated?</h2><p>Rank individual buildings or building-use categories using the normalized meter data. Electricity is shown in KWH, natural gas in CCF, and water in GAL.</p></div><div className="hero-total"><span>Total in view</span><strong>{compact(totalUsage)}</strong><small>{unitLabel}</small></div></section>
        <div className="ranking-controls"><div className="segmented"><button className={view === 'building' ? 'active' : ''} onClick={() => setView('building')}>By building</button><button className={view === 'use' ? 'active' : ''} onClick={() => setView('use')}>By building use</button></div><label><span>Unit</span><select value={unit} onChange={(e) => setUnit(e.target.value)}><option>KWH</option><option>CCF</option><option>GAL</option><option>All units</option></select></label><label><span>Rank by</span><select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}><option value="usage">Total usage</option><option value="readings">Reading count</option><option value="meters">Meter count</option></select></label><label className="ranking-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={view === 'building' ? 'Search buildings' : 'Search uses'} /></label><button className="sort-direction" onClick={() => setDescending(!descending)}>{descending ? '↓ Highest first' : '↑ Lowest first'}</button></div>
        <div className="result-line"><span><strong>{rows.length}</strong> {view === 'building' ? 'buildings' : 'building-use categories'} ranked by {sortBy}</span><span className="result-note">Click a row to return to the overview filtered to that property.</span></div>
        <section className="ranking-card card"><div className="ranking-header"><span>Rank</span><span>{view === 'building' ? 'Building' : 'Use category'}</span><span>Usage</span><span>Readings</span><span>Meters</span></div>{rows.map((row, index) => <a className="ranking-row" key={row.key} href={view === 'building' ? `/?property=${encodeURIComponent(row.code)}` : `/?use=${encodeURIComponent(row.use)}`}><span className="ranking-number">{String(index + 1).padStart(2, '0')}</span><div className="ranking-name"><strong>{row.name}</strong><small>{view === 'building' ? `${row.code} · ${row.use}` : `${row.meters} meters across ${row.types.join(' / ')}`}</small><div className="ranking-track"><i style={{ width: `${Math.max(row.usage / maxUsage * 100, 2)}%` }} /></div></div><strong className="ranking-value">{compact(row.usage)} <small>{unitLabel}</small></strong><span>{formatNumber(row.readings)}</span><span>{formatNumber(row.meters)}</span></a>)}{!rows.length && <div className="empty">No mapped buildings match these filters.</div>}</section>
        <footer>AiM Meter Intelligence <span>•</span> Building ranking view <span>•</span> Source: AssetWorks AiM export</footer>
      </section>
    </main>
  );
}
