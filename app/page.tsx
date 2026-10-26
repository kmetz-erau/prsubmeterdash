'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDate, formatNumber, MeterReading, parseMeterCsv, toDate } from '../lib/data';

const DATA_FILE = '/data/AiM_meter_readings_2026-10-26.csv';

function shortName(id: string) {
  if (!id) return 'Not assigned';
  return id.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value, value % 1 ? 1 : 0);
}

export default function Dashboard() {
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [selectedUom, setSelectedUom] = useState('KWH');
  const [selectedMeter, setSelectedMeter] = useState('All meters');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showOnlyExceptions, setShowOnlyExceptions] = useState(false);

  useEffect(() => {
    fetch(DATA_FILE).then((response) => response.text()).then((csv) => setReadings(parseMeterCsv(csv)));
  }, []);

  const uoms = useMemo(() => Array.from(new Set(readings.map((row) => row.normalizedUom))).sort(), [readings]);
  const meters = useMemo(() => Array.from(new Set(readings.filter((row) => !selectedUom || row.normalizedUom === selectedUom).map((row) => row.meter))).sort(), [readings, selectedUom]);

  const filtered = useMemo(() => readings.filter((row) => {
    const date = toDate(row.readingDate);
    const matchesUom = selectedUom === 'All units' || row.normalizedUom === selectedUom;
    const matchesMeter = selectedMeter === 'All meters' || row.meter === selectedMeter;
    const haystack = `${row.meter} ${row.description} ${row.readerId}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesStart = !startDate || (date && date >= new Date(`${startDate}T00:00:00`));
    const matchesEnd = !endDate || (date && date <= new Date(`${endDate}T23:59:59`));
    const matchesException = !showOnlyExceptions || row.adjusted || !row.verified || Boolean(row.error);
    return Boolean(matchesUom && matchesMeter && matchesSearch && matchesStart && matchesEnd && matchesException);
  }), [readings, selectedUom, selectedMeter, search, startDate, endDate, showOnlyExceptions]);

  const summary = useMemo(() => {
    const usage = filtered.reduce((sum, row) => sum + row.normalizedUsage, 0);
    const units = Array.from(new Set(filtered.map((row) => row.normalizedUom)));
    const verified = filtered.filter((row) => row.verified).length;
    const exceptions = filtered.filter((row) => row.adjusted || !row.verified || row.error).length;
    return { usage, units, verified, exceptions, meters: new Set(filtered.map((row) => row.meter)).size };
  }, [filtered]);

  const monthly = useMemo(() => {
    const grouped = new Map<string, { label: string; usage: number; count: number }>();
    filtered.forEach((row) => {
      const date = toDate(row.readingDate);
      if (!date) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const previous = grouped.get(key) || { label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), usage: 0, count: 0 };
      previous.usage += row.normalizedUsage;
      previous.count += 1;
      grouped.set(key, previous);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-18).map(([, value]) => value);
  }, [filtered]);

  const topMeters = useMemo(() => {
    const grouped = new Map<string, number>();
    filtered.forEach((row) => grouped.set(row.meter, (grouped.get(row.meter) || 0) + row.normalizedUsage));
    return Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filtered]);

  const maxMonthly = Math.max(...monthly.map((row) => row.usage), 1);
  const maxMeter = Math.max(...topMeters.map(([, value]) => value), 1);
  const recent = [...filtered].sort((a, b) => (toDate(b.readingDate)?.getTime() || 0) - (toDate(a.readingDate)?.getTime() || 0)).slice(0, 10);

  function resetFilters() {
    setSelectedUom('KWH'); setSelectedMeter('All meters'); setSearch(''); setStartDate(''); setEndDate(''); setShowOnlyExceptions(false);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">A</div><div><strong>AiM</strong><span>Meter intelligence</span></div></div>
        <nav><a className="active" href="#overview"><span>◈</span> Overview</a><a href="#readings"><span>▦</span> Readings</a><a href="#meters"><span>◌</span> Meter health</a></nav>
        <div className="sidebar-bottom"><div className="sync-dot" /> <div><small>Data source</small><strong>AssetWorks AiM</strong><span>Synced Oct 26, 2026</span></div></div>
      </aside>
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">OPERATIONS / UTILITIES</p><h1>Meter readings</h1></div><div className="top-actions"><span className="status-pill"><i /> Live dataset</span><button className="export-btn" onClick={() => window.open(DATA_FILE, '_blank')}>↗ View source CSV</button></div></header>
        <div className="filter-panel">
          <div className="filter-heading"><span>Filters</span><button onClick={resetFilters}>Reset all</button></div>
          <label className="search-field"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search meter or description" /></label>
          <label><span>Unit</span><select value={selectedUom} onChange={(e) => { setSelectedUom(e.target.value); setSelectedMeter('All meters'); }}><option>All units</option>{uoms.map((uom) => <option key={uom}>{uom}</option>)}</select></label>
          <label><span>Meter</span><select value={selectedMeter} onChange={(e) => setSelectedMeter(e.target.value)}><option>All meters</option>{meters.map((meter) => <option key={meter}>{meter}</option>)}</select></label>
          <label><span>From</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label><span>To</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <button className={`exception-toggle ${showOnlyExceptions ? 'on' : ''}`} onClick={() => setShowOnlyExceptions(!showOnlyExceptions)}><span className="toggle-dot" /> Exceptions only</button>
        </div>
        <div className="result-line"><span>Showing <strong>{formatNumber(filtered.length)}</strong> readings {selectedUom !== 'All units' ? `normalized to ${selectedUom}` : 'across all utilities'}</span><span className="result-note">{summary.exceptions ? `${formatNumber(summary.exceptions)} need review` : 'No exceptions in view'}</span></div>
        <section id="overview" className="kpis"><article><span className="kpi-label">Total usage</span><strong>{compact(summary.usage)}</strong><small>{summary.units.length === 1 ? summary.units[0] : 'mixed units'} · selected range</small></article><article><span className="kpi-label">Readings</span><strong>{formatNumber(filtered.length)}</strong><small>{summary.meters} active meters</small></article><article><span className="kpi-label">Verified</span><strong>{filtered.length ? `${Math.round(summary.verified / filtered.length * 100)}%` : '—'}</strong><small>{formatNumber(summary.verified)} of {formatNumber(filtered.length)} readings</small></article><article className={summary.exceptions ? 'warning' : ''}><span className="kpi-label">Exceptions</span><strong>{formatNumber(summary.exceptions)}</strong><small>{summary.exceptions ? 'Adjusted or unverified' : 'Everything looks clean'}</small></article></section>
        <section className="grid-two"><article className="card chart-card"><div className="card-head"><div><p className="eyebrow">TREND</p><h2>Usage by month</h2></div><span className="unit-tag">{selectedUom === 'All units' ? 'Normalized units' : selectedUom}</span></div>{monthly.length ? <div className="bar-chart" aria-label="Monthly usage chart">{monthly.map((item) => <div className="bar-wrap" key={item.label} title={`${item.label}: ${formatNumber(item.usage, 1)}`}><div className="bar" style={{ height: `${Math.max(item.usage / maxMonthly * 100, 3)}%` }} /><span>{item.label}</span></div>)}</div> : <div className="empty">No readings match these filters.</div>}</article><article id="meters" className="card"><div className="card-head"><div><p className="eyebrow">RANKING</p><h2>Highest usage meters</h2></div><span className="muted">Top 8</span></div><div className="meter-list">{topMeters.map(([meter, value], index) => <div className="meter-row" key={meter}><span className="rank">0{index + 1}</span><div className="meter-info"><div><strong>{meter}</strong><span>{compact(value)} {selectedUom === 'All units' ? 'normalized' : selectedUom}</span></div><div className="meter-track"><i style={{ width: `${value / maxMeter * 100}%` }} /></div></div></div>)}</div></article></section>
        <section id="readings" className="card table-card"><div className="card-head"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>Recent readings</h2></div><span className="muted">Latest 10 by reading date · normalized</span></div><div className="table-wrap"><table><thead><tr><th>Meter</th><th>Reading date</th><th>Unit</th><th>Usage</th><th>Reader</th><th>Status</th><th /></tr></thead><tbody>{recent.map((row) => <tr key={`${row.meter}-${row.readingDate}-${row.invoiceDate}`}><td><strong>{row.meter}</strong><small>{row.description.replace(/-METER READING/i, '').replace(/-ELECTRIC/i, ' electric')}</small></td><td>{formatDate(row.readingDate)}</td><td><span className="unit-tag">{row.normalizedUom}</span></td><td className="usage-cell">{formatNumber(row.normalizedUsage, 1)}</td><td>{shortName(row.readerId)}</td><td><span className={`status ${row.verified && !row.adjusted ? 'verified' : 'review'}`}><i />{row.adjusted ? 'Adjusted' : row.verified ? 'Verified' : 'Review'}</span></td><td><a className="source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">↗</a></td></tr>)}</tbody></table>{!recent.length && <div className="empty">No readings match these filters.</div>}</div></section>
        <footer>AiM Meter Intelligence <span>•</span> Built for facilities operations <span>•</span> Source: AssetWorks AiM export</footer>
      </section>
    </main>
  );
}
